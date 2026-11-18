# fuzd reveal-burst load test

Reproduces how the game uses fuzd: during a 23h commit phase every player schedules one time-locked execution, all for the same instant (the start of the reveal window), and every one must be broadcast before the window closes. Missing a reveal is a loss for that player, so the number that matters is not requests per second but **how many executions fuzd broadcasts inside the window**.

`reveal-burst.ts` has two phases:

- `schedule`: N simulated players (deterministic keys from `--seed`) each fetch their remote account, get it funded (`--fund anvil` uses `anvil_setBalance`) and schedule one execution for `--reveal-at` with `expiryDelta = --window`. Reports submission latency and errors.
- `watch`: polls fuzd until all executions are broadcast or the window closes. Reports in time / late / missing, delay percentiles, broadcasts per minute, and for missing ones what the queue says (`lastError`, retries, or archived).

State goes to `--state` (default `reveal-burst.state.json`), so `watch` can be restarted. Needs node >= 23 (native type stripping) and the workspace built (`pnpm install` at the root builds it).

## Options

| option | default | meaning |
| - | - | - |
| `--fuzd <url>` | required | fuzd endpoint |
| `--chain-id` | `31337` | chain |
| `--rpc <url>` | | anvil RPC, needed for `--fund anvil` |
| `--fund anvil\|none` | `anvil` | how remote accounts get gas money |
| `--count` | `100` | players |
| `--concurrency` | `10` | submissions in flight |
| `--spread <s>` | `0` | spread submissions over this many seconds (a compressed commit phase) |
| `--reveal-at` | `+300` | `+<seconds>`, `next-hour`, or a unix timestamp |
| `--window <s>` | `3600` | reveal window, also the executions' `expiryDelta` |
| `--no-expiry` | | schedule without `expiryDelta` |
| `--in-clear` | | skip drand time-lock (isolates the drand cost) |
| `--max-fee-gwei` | `100` | `maxFeePerGasAuthorized` |
| `--poll <s>` / `--poll-concurrency` | `10` / `10` | watch polling |

## Scenario 1: local baseline (Node.js platform + anvil)

Anvil must mine on a timer (`--block-time 1`), otherwise the chain time fuzd reads never advances. `--process-interval 60` mimics the Cloudflare crons; use `1` to see what the code does without the cron cadence.

```sh
anvil --port 38545 --block-time 1 &
node platforms/nodejs/dist/cli.js --port 33000 \
  --chain "31337=http://127.0.0.1:38545#finality=2&worstCaseBlockTime=5" \
  --mnemonic "test test test test test test test test test test test junk" \
  --process-interval 60 &

cd tests/load
node reveal-burst.ts schedule --fuzd http://localhost:33000 --rpc http://127.0.0.1:38545 \
  --count 40 --reveal-at +90 --window 600 --state /tmp/state.json
node reveal-burst.ts watch --state /tmp/state.json
```

Stop both background processes afterwards.

Measured baseline (40 players, 60s interval): 40/40 in time, exactly 10 broadcasts per minute, last one 205s after the reveal. That is the `maxNumTransactionsToProcessInOneGo: 10` batch (`packages/server/src/setup.ts`) times one `processQueue` per minute: **a 1h window holds at most about 600 reveals, a 2h window about 1200**, on any host.

## Scenario 2: Cloudflare staging (the real numbers)

Never run this against production: it broadcasts real transactions and bills the production D1.

1. `cd platforms/cf-worker && npx wrangler d1 create fuzd-db-staging`, paste the id into `[env.staging]` in `wrangler.toml`.
2. `pnpm init-db:staging`
3. Secrets: `npx wrangler secret put HD_MNEMONIC -e staging`, same for `TOKEN_ADMIN` and `CHAIN_<id>` (an RPC url with `#finality=..&worstCaseBlockTime=..`).
4. `pnpm deploy:staging`

For the chain, either a testnet (use `--fund none` and pre-fund the remote accounts, which `schedule` prints into the state file), or a local anvil exposed to the worker with a tunnel (`cloudflared tunnel --url http://localhost:38545`) and `--fund anvil --rpc <tunnel url>`. The tunnel adds RPC latency, which is realistic since your production RPC is remote too.

Suggested ladder, each with `--reveal-at +600 --window 3600`: `--count 100`, `600`, `1000`, `2000`. Watch the worker in the dashboard during the burst: cron CPU time, wall time, D1 query count and `overloaded` errors.

## Things the test does NOT cover

- Gas spikes: a reveal that is broadcast but stuck under-priced is resubmitted by `processTransactions`, also 10 per minute.
- The game's own commit transactions and its RPC quota. All fuzd traffic goes through one RPC key, roughly 8 calls per execution, and the provider's rate limit may be the first wall.
- Drand outages. Time-locked executions cannot be decrypted without a drand beacon.

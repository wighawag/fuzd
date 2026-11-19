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

Measured before `drain-reveal-bursts` (40 players, 60s interval): exactly 10 broadcasts per minute, the fixed batch of 10 times one `processQueue` per minute, so a 1h window held at most about 600 reveals on any host. Since then a run drains due executions up to its processing budget (`PROCESSING_*`, 100 per run by default).

## Scenario 2: Cloudflare staging (the real numbers)

Never run this against production: it broadcasts real transactions and bills the production D1.

1. `cd platforms/cf-worker && npx wrangler d1 create fuzd-db-staging`, paste the id into `[env.staging]` in `wrangler.toml`.
2. `pnpm init-db:staging`
3. Secrets: `npx wrangler secret put HD_MNEMONIC -e staging`, same for `TOKEN_ADMIN` and `CHAIN_<id>` (an RPC url with `#finality=..&worstCaseBlockTime=..`).
4. `pnpm deploy:staging`

For the chain, either a testnet (use `--fund none` and pre-fund the remote accounts, which `schedule` prints into the state file), or a local anvil exposed to the worker with a tunnel (`cloudflared tunnel --url http://localhost:38545`) and `--fund anvil --rpc <tunnel url>`. The tunnel adds RPC latency, which is realistic since your production RPC is remote too.

Suggested ladder, each with `--reveal-at +600 --window 3600`: `--count 100`, `600`, `1000`, `2000`. Watch the worker during and after the burst with `cf-analytics.ts` (below): invocations, errors, CPU and wall time per minute. `wrangler tail` is not enough there: under load it samples, and drops most busy invocations and their logs.

Measured on staging (2026-11-18, RPC through a tunnel):

| run | before | after (default budget, 100 per run) | after (`PROCESSING_MAX_ITEMS_PER_RUN=200`) |
| - | - | - | - |
| 300 players | 29.7 min, 10/min | | |
| 600 players | about 60 min (window edge) | 6 min, 600/600 | |
| 2000 players | about 200 min, ~1400 missed | | 10.3 min, 2000/2000 |
| cron CPU per run | under 1s (10) | 4 to 7s (100) | 9 to 20s (200), limit 30s |

Then with the processing loops (`PROCESSING_LOOPS`, `docs/adr/0004-claim-due-items-with-a-lease.md`), same day, default budget:

| run | crons only (`PROCESSING_LOOPS=0`) | 4 loops | 8 loops |
| - | - | - | - |
| 600 players | 6.1 min, about 100/min | | |
| 2000 players | | 2.8 min, 810 in the first minute | 1.3 min, 1577 in the first minute |
| CPU per invocation | 4.3 to 8.4s (cron, 100) | up to 10.7s (alarm: 100 + pending checks) | same |

Set the loop count with `printf 4 | npx wrangler secret put PROCESSING_LOOPS -e staging`, and back to `0` afterwards: an idle loop keeps waking every 5s.

## Measuring on Cloudflare: cf-analytics.ts

`cf-analytics.ts` reads the GraphQL analytics API, which counts every invocation (`wrangler tail` samples under load), and prints one line per minute and source: the Durable Object alarms (the processing loops, `durableObjectsInvocationsAdaptiveGroups`) and the Worker's own invocations by event type (`cron`, `fetch`, from `workersInvocationsAdaptive`), with the number of invocations, errors, CPU and wall time p50 and p99, and the Worker's total CPU, all in seconds.

```sh
export CLOUDFLARE_API_TOKEN=...   # a token with Account Analytics: Read
cd tests/load
node cf-analytics.ts --script fuzd-cf-worker-staging --since=-30m
node cf-analytics.ts --since 2026-11-18T16:20:00Z --until 2026-11-18T16:40:00Z --account <account id>
```

| option | default | meaning |
| - | - | - |
| `--script` | `fuzd-cf-worker-staging` | the Worker's name |
| `--account` | `CLOUDFLARE_ACCOUNT_ID`, else read from `wrangler whoami` (in `platforms/cf-worker`) | account id; needed when the token sees several accounts |
| `--since` / `--until` | `-60m` / `-0m` | `-<n>m`, `-<n>h`, `-<n>d` before now (written `--since=-30m`: node's argument parser takes `--since -30m` for an option), or an ISO time |
| `--json` | | print the API's answer as it is |

The analytics lag a minute or two behind real time. `node --test cf-analytics.test.ts` (or `pnpm test` here) checks the parsing and the table against an answer recorded from staging (`fixtures/cf-analytics-sample.json`), without the network.

Details in `work/notes/findings/cloudflare-worker-cron-capacity.md`.

## Things the test does NOT cover

- Gas spikes: a reveal that is broadcast but stuck under-priced is resubmitted by `processTransactions`, within the same processing budget; the load test never raises gas prices.
- The game's own commit transactions and its RPC quota. All fuzd traffic goes through one RPC key, roughly 8 calls per execution, and the provider's rate limit may be the first wall.
- Drand outages. Time-locked executions cannot be decrypted without a drand beacon.

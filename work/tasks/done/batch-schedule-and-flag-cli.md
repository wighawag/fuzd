---
title: A multi-transaction submission in @fuzd/client, a flag-driven fuzd CLI, and the end-to-end tests on free ports
slug: batch-schedule-and-flag-cli
blockedBy: []
covers: []
---

Built directly on request, for stratagems' step 8 (`work/plans/join-template-commit-reveal.md` on stratagems' `step-8` branch, item 3: P4, P12 and Q8-11). The measurements it started from are `work/notes/findings/scheduled-execution-batch-is-already-multi-transaction.md`, `work/notes/findings/fuzd-nodejs-cli-shape.md` and the observation `end-to-end-tests-use-port-8546.md` (discharged here: the suite now runs on free ports).

## What was built

- `@fuzd/client`: `scheduleExecution` takes `transactions: [...]` (a batch) or `transaction` (unchanged); the payload's `executions` is the list in order, in clear and time-locked alike. `computeTotalMaxCost` and `computeBalanceRequired` take `{maxFeePerGasAuthorized, transactions}` too. Tests run the client against an in-process `@fuzd/server` on `:memory:` and an offline drand network (a BLS key made up in the test), so the time-locked batch is decrypted back without the internet.
- `@libsql/client` `^0.18.0` and `remote-sql-libsql` `^0.0.7` in every package that depends on them (and `libsql` `^0.5.29` in `tests/ethereum` and `tests/starknet`), with a `:memory:` test in `@fuzd/server` that writes, runs a `transaction()` and reads back (red on 0.14.0, green on 0.18.0).
- The `fuzd` CLI: `--db`, `--chain <chainId>=<rpc>` (repeatable), `--mnemonic`, `--admin-token`, `--time-lock-decryption`, `--payment-account`, `--contract-timestamp`, `--dev`, beside `--port` and `--process-interval`; a flag overrides its env variable. `.env.default` configures no chain. A smoke test (`platforms/nodejs/test/cli.smoke.test.ts`) spawns the built CLI on free ports from a scratch directory, each in its own process group.
- `@fuzd/server`: `GET /` answers its package version (generated into `src/version.ts` at build); `/admin/setChainOverride` reads `DEV` through `getEnv`.
- `tests/end-to-end`: anvil's and fuzd's proxy ports come from `E2E_ANVIL_PORT` / `E2E_FUZD_PORT` or are picked free at globalSetup and passed to the workers through the env; the stale tests are repaired (admin auth, the current `timing` API, a funded remote account), and a new test schedules a batch of three transactions with `@fuzd/client` and checks the CLI broadcasts them from one remote account with consecutive nonces, mined in order.

## Acceptance criteria

- [x] A batch reaches the scheduler in order, in clear and time-locked (decrypting back to the same ordered list); the one-transaction form is unchanged on the wire (the exact string 0.11.4 sends, and its signature).
- [x] The payment of a batch is computed over every transaction.
- [x] `@libsql/client` `^0.18.0` everywhere, with the `:memory:` transaction test.
- [x] The CLI takes its configuration as flags, a flag over the env, nothing defaulting to port 8545 or 8546; smoke-tested; documented in its README.
- [x] The end-to-end suite runs on free ports, and passes.
- [x] Changesets for `@fuzd/client` (minor), `fuzd` (minor) and `@fuzd/server` (patch).

## Decisions

- **The list form is a second shape of the same argument**, `transactions` beside `transaction` (exactly one of them, refused otherwise, and an empty list refused), rather than a second function. `maxFeePerGasAuthorized` and `criticalDelta` stay per submission and are copied onto every execution, as the wire already carries them per execution.
- **Fees are counted per transaction** in `computeTotalMaxCost`: the fixed fee and the proportional fee apply to each transaction's `gas * maxFeePerGasAuthorized`, because the executor computes and charges them per broadcast (`computeFees` in `packages/executor/src/executor.ts`), and a batch is broadcast as separate transactions.
- **The client tests use an offline drand** (`packages/client/test/utils/fake-drand.ts`, scheme `pedersen-bls-unchained`) and the existing `fakeEncrypt` option, so the time-locked path is decrypted in the verify gate with no network.
- **`remote-sql-libsql` 0.0.7 is its latest version, and its code is identical to 0.0.6**; it declares `@libsql/core` `^0.17.2` as its peer, so pnpm keeps a `@libsql/core` 0.17.4 beside 0.18.0 for that package's types only (it imports only the `Client` type). A `remote-sql-libsql` release widening the peer to `^0.18` would remove it. `@fuzd/server`'s own `remote-sql` moved to `^0.0.7` with it (also identical code) so the tree has one.
- **The version route was fixed in this work** because the smoke test reads it and stratagems' plan inferred from `api.fuzd.dev` answering `fuzd api : 0.7.0` that the hosted service is at 0.7: that string was hard-coded, and the published `fuzd` 0.11.2 answers it too. It says nothing about the hosted version.
- **`--dev` was added to the CLI** because vitest sets `DEV=1` in the env the end-to-end instances inherit, while only `DEV=true` enables `/admin/setChainOverride`; the flag makes it explicit. The `.env.default` keeps `DEV=true`, the test mnemonic and `TOKEN_ADMIN=random-token` (public defaults for a local chain, as the README says); with no token at all, a `:memory:` start makes a random one for its own setup.
- **The CLI's `--port` keeps its default of 3000** (unchanged); the smoke test and the end-to-end suite always pass free ports.
- **The smoke test and the end-to-end suite are not in the verify gate** (`dorfl.json` tests `./packages/*` only); they ran beside it. Adding `platforms/nodejs`'s test to the gate (and `release:ci`) is left to the maintainer.
- **Not changed**: `platforms/cf-worker/.dev.vars.default` still points chain 31337 at 8545 (wrangler's local dev, not the CLI), and `platforms/cf-worker/test/basic.test.ts` expects the root route to answer `fuzd api` (stale before this work, and not run by the gate).

# fuzd

## 0.13.0

### Minor Changes

- 634d9b2: Processing runs may now overlap safely: several crons, loops or processes on one database. `processQueue` and `processPendingTransactions` claim each batch of due items in one atomic statement, for a lease (`ProcessingBudget.leaseDurationMs`, `PROCESSING_LEASE_DURATION_MS`, 2 minutes by default), so two runs never process the same execution, and the items of a run that crashed come back once its lease expires. Writing an item back releases it, and a run releases whatever it still holds when it ends. See `docs/adr/0004-claim-due-items-with-a-lease.md`.

  A run now says when it stopped on its budget rather than for lack of due work: `QueueProcessingResult.budgetExhausted`, and `processPendingTransactions` returns `{executions, budgetExhausted}` (it returned the executions typed as `void`); `/internal/processTransactions` answers `budgetExhausted` beside `transactions`. `@fuzd/server` exports `createProcessingLoop(app, {intervalMs})`, which runs each action back to back while its runs stop on their budget, and every `intervalMs` otherwise, and `runInternalAction`.

  Storage interfaces: `SchedulerStorage` has `claimDueExecutions` and `releaseExecutionClaims`, `ExecutorStorage` has `claimPendingExecutions` and `releasePendingExecutionClaims`. The SQL storages add the columns `claimedBy` and `claimExpiresAt` to `ScheduledExecutions` and `BroadcastedExecutions`, with an index on `claimedBy`.

  Upgrading an existing database: every write of this version names the new columns, so until they exist, scheduling and processing fail. `/admin/setup` adds them (and the indexes), so run it right after deploying; the schema files alone (`init-db`) do not add columns to an existing table. To have no gap at all, add the columns before deploying (the previous version ignores them):

  ```sql
  ALTER TABLE ScheduledExecutions ADD COLUMN claimedBy text;
  ALTER TABLE ScheduledExecutions ADD COLUMN claimExpiresAt integer;
  ALTER TABLE BroadcastedExecutions ADD COLUMN claimedBy text;
  ALTER TABLE BroadcastedExecutions ADD COLUMN claimExpiresAt integer;
  ```

  then run `/admin/setup` after deploying for the indexes.

  The `fuzd` CLI runs each action back to back during a burst, and every `--process-interval` when idle. Several `fuzd` processes may share one database.

  The Cloudflare Worker (`platforms/cf-worker`, not published) now runs `processQueue` and `processTransactions` from a pool of Durable Object alarm loops (`ProcessingLoop`, migration `v1-processing-loop`), one by default (`PROCESSING_LOOPS`), each waking every 5s when idle (`PROCESSING_LOOP_IDLE_MS`) and back to back during a burst; the crons keep running as a fallback. Measured on staging, 2000 reveals due at once: 1.3 minutes with 8 loops, 2.8 with 4, against about 20 with the crons alone.

### Patch Changes

- 78c897b: Queue processing drains a burst of executions due at the same time, instead of 10 per run. `processQueue` and `processPendingTransactions` now fetch only due items, chain by chain, and keep pulling batches until a processing budget is spent (`ProcessingBudget`, from `@fuzd/common`: 100 items, 40s, 10 concurrent, batches of 50 by default, sized for a Cloudflare cron). Items of different accounts (different broadcasters) run concurrently, those of one account in order. Measured on a Cloudflare Workers staging deployment: 2000 executions scheduled for the same instant were all broadcast within 10.3 minutes (it took 10 minutes per 100 before). `@fuzd/server` reads the budget from `PROCESSING_BATCH_SIZE`, `PROCESSING_CONCURRENCY`, `PROCESSING_MAX_ITEMS_PER_RUN` and `PROCESSING_MAX_DURATION_MS`.

  An execution whose processing fails (the executor refused it for lack of balance or a revert, an RPC or drand request failed, the decryption failed) is now rescheduled with its error and a growing delay (5s doubling up to 2 minutes). Before, it stayed first in the queue unchanged, and 10 of them blocked every other execution indefinitely. A broadcast transaction checked without needing action is now checked again 60s later rather than at once, so the same few no longer monopolise `processPendingTransactions`.

  The executor checks again, once it holds the broadcaster's lock, that the execution's slot was not broadcast meanwhile: overlapping runs could otherwise send the same execution twice, with two nonces.

  The `/internal/*` routes (processQueue, processTransactions, checkScheduledExecutionStatus) now require the admin credentials, or the token of the server instance itself, which the platforms' crons send through the new `app.internalRequest(action)`. They were open to anyone. The `fuzd` CLI no longer starts a run of an action while its previous run is still going.

  Storage interfaces: `SchedulerStorage.getQueueTopMostExecutions` and `ExecutorStorage.getPendingExecutions` take optional `chainId` and due-time filters, and `ExecutorStorage` has a new `postponePendingExecution`. The scheduler schema adds the index `idx_ScheduledExecutions_chainId_broadcasted_nextCheckTime` (rerun the setup to create it).

- Updated dependencies [c162c27]
- Updated dependencies [9cf2ad5]
- Updated dependencies [634d9b2]
- Updated dependencies [ef023b9]
- Updated dependencies [ce469f4]
- Updated dependencies [c3df485]
- Updated dependencies [78c897b]
- Updated dependencies [d63f9c0]
- Updated dependencies [bb64037]
- Updated dependencies [a86ddf2]
- Updated dependencies [52e27a9]
- Updated dependencies [7175a77]
- Updated dependencies [a5edf73]
  - @fuzd/server@0.13.0

## 0.12.0

### Minor Changes

- 7af6e4f: The CLI takes its configuration as flags, each overriding its environment variable (which still works): `--db` (`DB`, default `:memory:`, which runs the setup at start), `--chain <chainId>=<rpc>` (repeatable, `CHAIN_<chainId>`, with the `#finality=..&worstCaseBlockTime=..&protocol=..` suffix), `--mnemonic` (`HD_MNEMONIC`), `--admin-token` (`TOKEN_ADMIN`), `--time-lock-decryption <true|false>`, `--payment-account`, `--contract-timestamp`, `--dev` (`DEV=true`), beside `--port` (default 3000) and `--process-interval` (default 1). See its README.

  `.env.default` no longer configures chain 31337 at `http://127.0.0.1:8545`: no chain is served unless one is given. `.env.default` no longer sets `TOKEN_ADMIN=random-token` and `DEV=true`: with no `--admin-token` (or `TOKEN_ADMIN`) the admin routes are closed (the setup of a `:memory:` database uses a random token of its own), and the development routes such as `/admin/setChainOverride` need `--dev`. A failed setup stops the process. `@libsql/client` is now `^0.18.0`, which keeps a `:memory:` database across `transaction()` (0.14 to 0.17 lost it), and `remote-sql-libsql` `^0.0.7`.

### Patch Changes

- Updated dependencies [7af6e4f]
  - @fuzd/server@0.12.1

## 0.11.2

### Patch Changes

- 05d9f09: `--help` no longer prints the command name twice (`Usage: fuzd fuzd ...`, `Usage: fuzd-client fuzd-client ...`), and `fuzd-client` starts again on Node 22+: it imported its package.json with `assert` (removed from Node) and from a path that does not exist in the published package.
- c3771ca: Use `@hono/node-server` 1.19, which matches hono 4.13: the server no longer logs `Failed to find Response internal state key` at startup.

## 0.11.1

### Package name

- Published as `fuzd`, previously `fuzd-nodejs`. Same code; `fuzd-nodejs` stops at its last version and is deprecated. Its command is now `fuzd` (was `fuzd-nodejs`).

### Patch Changes

- Updated dependencies [fdeaaab]
  - fuzd-server@0.12.0

## 0.11.0

### Minor Changes

- update

### Patch Changes

- Updated dependencies
  - fuzd-server@0.11.0

## 0.10.2

### Patch Changes

- Updated dependencies
  - fuzd-server@0.10.2

## 0.10.1

### Patch Changes

- Updated dependencies
  - fuzd-server@0.10.1

## 0.10.0

### Minor Changes

- release

### Patch Changes

- Updated dependencies
  - fuzd-server@0.10.0

## 0.9.7

### Patch Changes

- fuzd-server@0.9.7

## 0.9.6

### Patch Changes

- fuzd-server@0.9.6

## 0.9.5

### Patch Changes

- fuzd-server@0.9.5

## 0.9.4

### Patch Changes

- Updated dependencies
  - fuzd-server@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [1e8f8b0]
  - fuzd-server@0.9.3

## 0.9.2

### Patch Changes

- Updated dependencies
  - fuzd-server@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies
  - fuzd-server@0.9.1

## 0.9.0

### Minor Changes

- some changes

### Patch Changes

- Updated dependencies
  - fuzd-server@0.9.0

## 0.8.2

### Patch Changes

- fuzd-server@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies
  - fuzd-server@0.8.1

## 0.8.0

### Minor Changes

- refactor

### Patch Changes

- Updated dependencies
  - fuzd-server@0.8.0

## 0.7.8

### Patch Changes

- fuzd-server@0.7.5

## 0.7.7

### Patch Changes

- Updated dependencies
  - fuzd-server@0.7.4

## 0.7.6

### Patch Changes

- fuzd-nodejs: add auto internal process

## 0.7.5

### Patch Changes

- fixes
- Updated dependencies
  - fuzd-server@0.7.3

## 0.7.4

### Patch Changes

- add sql folder

## 0.7.3

### Patch Changes

- fix dependencies for fuzd-client and fuzd-nodejs

## 0.7.2

### Patch Changes

- cli for nodejs + autoSetupDB
- Updated dependencies
  - fuzd-server@0.7.2

---
title: More than one processing run at a time, on Cloudflare and on nodejs, made safe by claims with a lease
slug: parallel-processing
blockedBy: []
covers: []
---

Built directly on request, after `drain-reveal-bursts`: the game's reveal needs capacity well beyond the 100 to 200 executions one Cloudflare cron run handles per minute, and less than a minute of latency. The decision and the options compared are `docs/adr/0004-claim-due-items-with-a-lease.md`; the measurements are in `work/notes/findings/cloudflare-worker-cron-capacity.md`.

Before: the only protection against two runs handling the same execution was the broadcaster lock plus the re-check under it. Every run read the same due set, so overlapping runs repeated each other's work, and a run that lost the race rewrote the scheduled row with `broadcasted = false` (healed later).

## What was built

- `@fuzd/common`: `ProcessingBudget.leaseDurationMs` (120s by default).
- `@fuzd/scheduler`: `processQueue` claims each batch (`SchedulerStorage.claimDueExecutions`) under a per-run claimant id, releases what it still holds at the end (`releaseExecutionClaims`: an execution due by its check-in time but not yet by its timing is not written back, as before, and is released there), and reports `budgetExhausted`.
- `@fuzd/executor`: `processPendingTransactions` the same way (`claimPendingExecutions`, `releasePendingExecutionClaims`), and returns `{executions, budgetExhausted}`.
- `@fuzd/server`: the claim columns (`claimedBy`, `claimExpiresAt`) and an index on `claimedBy` for both tables, added to existing databases by `/admin/setup` (`addMissingColumns`); every write of a row releases its claim; `PROCESSING_LEASE_DURATION_MS`; `/internal/processTransactions` answers `budgetExhausted`; `createProcessingLoop` and `runInternalAction`.
- `fuzd` (nodejs): the CLI runs each action through `createProcessingLoop`: back to back while its runs stop on their budget, every `--process-interval` otherwise. Several processes on one database are safe.
- `platforms/cf-worker`: `ProcessingLoop`, a Durable Object class (`src/processing-loop.ts`, migration `v1-processing-loop`, binding `PROCESSING_LOOP` in both environments). `PROCESSING_LOOPS` of them (1 by default) run `processQueue` and `processTransactions` from their alarm, again at once while there is more, else after `PROCESSING_LOOP_IDLE_MS` (5s). The cron starts them every minute and still processes, as a fallback.
- Tests `packages/server/test/parallel-processing.test.ts`, on the in-process harness extended with peers (other server instances with their own connection to the same database file, like other processes) and an RPC call hook: three concurrent `processQueue` runs over 40 due executions handle each exactly once, send 40 transactions at nonce 0 and leave every row `broadcasted = 1` (red before: each execution handled 3 times); refused executions are retried once, by one run, and no claim is left; three concurrent `processTransactions` runs check each transaction once; a claim of a crashed run hides its items until it expires, for scheduled executions and pending transactions; the claim lasts the configured lease; a run reports `budgetExhausted` and the loop drains 12 executions with runs of 5 and an interval of 60s; `/admin/setup` adds the columns to an old database, twice in a row. The existing `queue-processing` tests pass unchanged. `platforms/cf-worker/test/processing-loop.node.test.ts` (`pnpm test:node`, outside the verify gate, which covers `packages/*` only) drives the Durable Object loop on a fake state: settings, start, idle pause, again at once on `budgetExhausted`, a next alarm kept when the actions fail, stopped beyond the pool.

## Acceptance criteria

- [x] Two concurrent runs over the same due items never process the same one (RPC sends and rows counted).
- [x] A lease that expires is picked up again.
- [x] The existing queue-processing tests still pass; the verify gate and the end-to-end suite pass.
- [x] ADR for the lease and the Cloudflare choice (`docs/adr/0004`), with the limits checked on developers.cloudflare.com.
- [x] Measured on Cloudflare staging, before and after; numbers in the finding.
- [x] Changeset (`@fuzd/common`, `@fuzd/scheduler`, `@fuzd/executor`, `@fuzd/server`, `fuzd`: minor).

## Decisions

- **The claim is one `UPDATE ... WHERE rowid IN (SELECT ...) RETURNING *`**, which SQLite, libsql and D1 run atomically; no read-then-write. Its expiry is real time in milliseconds (`claimExpiresAt`), not chain time: a lease is about processes.
- **The claim index is created by the setup code, not the schema files** (found in review): `init-db` runs those files on an existing database, where a `CREATE INDEX` on a column the old table lacks would fail. Until `/admin/setup` has run on an upgraded database, writes fail; the changeset gives the `ALTER TABLE` statements to run before deploying for no gap.
- **Writes release, and a run releases the rest at its end.** No guarded writes (`WHERE claimedBy = me`): with a lease well above a run's duration, only a run stuck past its lease can meet another one on an item, and the broadcaster lock and the re-check under it still stop a second broadcast then.
- **Cloudflare: a pool of Durable Object alarm loops**, rather than more cron triggers (no latency gain, all fire at the same second) or a Queue (latency still bound to the cron that fills it, one more product per environment). Reasons and limits in the ADR. The loops stop when `DISABLE_CRON` is set or when the pool is made smaller.
- **The next alarm is set before the work**, so a run killed on its CPU limit does not end its loop; the cron restarts a loop whose alarm stopped.
- **`processQueue` and `processTransactions` run one after the other in an alarm**, not concurrently: an invocation has at most 6 simultaneous outgoing connections (Workers and Durable Objects limits), which the runs' concurrency of 10 already exceeds, so running both at once would add CPU to one invocation without adding network parallelism. More throughput comes from more loops.
- **The measurements ran on a fresh chain id (31338)** with its own anvil, because the staging database still held rows of chain 31337 from the previous session (290 unfinalized transactions, 1981 executions due in two days); `CHAIN_31337` on staging now points at an unreachable URL, so they stay untouched. Nothing was deleted.
- **Default `PROCESSING_LOOPS` is 1**: an idle loop wakes every 5s and each alarm costs a few hundred milliseconds of CPU (mostly `setup` deriving the server account from the mnemonic on every request) and two RPC requests per chain. Raise it for a deployment that expects bursts; the finding gives the throughput per loop count.

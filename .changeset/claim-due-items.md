---
'@fuzd/common': minor
'@fuzd/scheduler': minor
'@fuzd/executor': minor
'@fuzd/server': minor
'fuzd': minor
---

Processing runs may now overlap safely: several crons, loops or processes on one database. `processQueue` and `processPendingTransactions` claim each batch of due items in one atomic statement, for a lease (`ProcessingBudget.leaseDurationMs`, `PROCESSING_LEASE_DURATION_MS`, 2 minutes by default), so two runs never process the same execution, and the items of a run that crashed come back once its lease expires. Writing an item back releases it, and a run releases whatever it still holds when it ends. See `docs/adr/0004-claim-due-items-with-a-lease.md`.

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

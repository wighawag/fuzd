---
status: accepted
---

# Due items are claimed with an expiring lease, so processing runs can overlap; on Cloudflare a pool of Durable Object alarm loops runs them back to back

A game reveal makes every player's execution due at the same instant, and each must be broadcast inside a 1h (maybe 2h) window. One Cloudflare cron run handles about 100 to 200 executions (CPU bound, 30s cron limit), and runs once a minute: about 6000 to 12000 per hour at best, with up to a minute of latency (`work/notes/findings/cloudflare-worker-cron-capacity.md`). Going further needs more than one processing run at a time, on one database. Before that is safe, every due item (a `ScheduledExecutions` row for `processQueue`, a `BroadcastedExecutions` row for `processTransactions`) is **claimed** by one run, with a lease. On Cloudflare the runs come from a pool of Durable Objects whose alarms run them back to back while there is work; on nodejs, from the CLI's loop, and several CLI processes may share a database.

## The lease

- Two columns per table: `claimedBy` (the run, `processQueue:<uuid>`) and `claimExpiresAt` (unix ms, real time, not chain time).
- A run claims each batch with ONE statement, `UPDATE ... SET claimedBy, claimExpiresAt WHERE rowid IN (SELECT rowid ... due AND (claimExpiresAt IS NULL OR claimExpiresAt <= now) ORDER BY nextCheckTime LIMIT n) RETURNING *`. SQLite, libsql and D1 (single writer per database) run it atomically, so two runs never get the same row.
- Writing a row back releases it: the upsert of a scheduled execution and of a pending transaction, and the hash-guarded postpone, set both columns to NULL; an archive deletes the row. At the end of a run, `release...Claims(claimant)` frees anything it still holds (items it skipped, a write that failed), so they do not wait for the lease.
- The lease (`ProcessingBudget.leaseDurationMs`, `PROCESSING_LEASE_DURATION_MS`, 120s by default) is well above a run's duration (its budget stops new batches after 40s). A run that crashed loses its items for at most that long, then any run picks them up again.
- The existing defences stay: the broadcaster lock, and the re-check under it that the slot was not broadcast meanwhile. They now matter only when a lease expires while its run is still working (a run stuck longer than the lease); then the residual of `work/tasks/done/drain-reveal-bursts.md` (a late full-row write over `broadcasted = true`, healed at the next processing) is possible again, and only then.
- Existing databases get the columns, and the index on `claimedBy`, from `/admin/setup` (`setupClaimColumns`: SQLite has no `ADD COLUMN IF NOT EXISTS`). The index is created there rather than in the schema files, which `init-db` runs as they are: on a table created before the columns, a `CREATE INDEX` on them would fail and stop the file. Until the setup has run, every write fails (the upserts name the columns), so it is run right after deploying, or the columns are added before (the previous version ignores them).

## Cloudflare: a pool of Durable Object alarm loops

`platforms/cf-worker/src/processing-loop.ts`: `PROCESSING_LOOPS` Durable Objects (1 by default) named `processing-loop-<i>`. Each one's alarm runs `processQueue` then `processTransactions` (one budgeted run each); it fires again at once when a run reports `budgetExhausted`, else after `PROCESSING_LOOP_IDLE_MS` (5s). The next alarm is set before the work, so a run killed on its CPU limit does not stop the loop. The every-minute cron starts any loop that is not running (after a deploy, or an alarm whose retries ran out) and still runs both actions itself, as a fallback; with claims the overlap is harmless. Making the pool smaller stops the loops above it at their next alarm.

Limits that decided it, from developers.cloudflare.com (fetched 2026-11-18: workers/platform/limits, queues/platform/limits, durable-objects/platform/limits, durable-objects/api/alarms, d1/platform/limits):

- A Cron Trigger gets 30s of CPU when its interval is under 1 hour (not configurable), 15 minutes of wall time; 250 Cron Triggers per account on Workers Paid; the finest schedule is one minute.
- A Queue consumer invocation: 30s of CPU by default, configurable to 5 minutes; batches of up to 100 messages; up to 250 concurrent consumer invocations; 5000 messages per second per queue.
- A Durable Object: 30s of CPU per request by default, configurable to 5 minutes; an alarm can be set for any time (milliseconds), only one `alarm()` runs at a time per object, alarms are retried with backoff (up to 6 times) when the handler throws; 15 minutes of wall time per alarm.
- D1: one database processes queries one at a time, 1000 queries per Worker invocation on Workers Paid.

## Considered Options

- **(a) Several cron triggers mapped to processQueue.** Simplest, and each invocation has its own 30s of CPU, so N triggers give about N times the capacity. Rejected as the main mechanism: every trigger fires in the same second of the same minute, so the latency stays a minute and the runs all start at once on the same due set (claims make that safe, not useful); capacity is fixed per minute by the number of triggers, which also run every minute when nothing is due. It is what the current config already does for two actions (`* * * * *` and `*/1 * * * *`).
- **(b) A Cloudflare Queue the cron fills with due execution keys, and a consumer that processes them.** The most capacity (up to 250 concurrent consumers), but the cron filling it still runs once a minute, so the latency does not improve unless something else produces; it is one more product to provision per environment; and the claim moves to enqueue time (a key enqueued must not be enqueued again by the next cron while it waits), with retries and dead letters to reason about on top of fuzd's own retry. Keep it for when one database's processing, not the invocation, is the limit; then sharding (`work/notes/ideas/shard-users-by-address.md`) is the next step anyway.
- **(c) A Durable Object alarm loop.** Picked, as a pool: sub-minute latency (an idle loop looks every 5s, a busy one runs back to back), each alarm a new invocation with its own CPU budget, loops in parallel on one database thanks to the claims, nothing to provision but a class migration, and the crons as a fallback. One loop is CPU bound to at most a minute of CPU per minute; more loops scale until the database or the RPC is the limit.

## Consequences

- An idle loop costs, every `PROCESSING_LOOP_IDLE_MS`, one chain timestamp request and one claim statement per action and per chain: about 24 RPC requests per minute per loop at 5s. That counts against the RPC provider's quota.
- Two runs may now hold different items of one account at the same time, where before every run saw the same set: they meet on the broadcaster lock (waits up to 1s, then the item is retried after 5s). For a game (one reveal per player per round) this is rare.
- `QueueProcessingResult.budgetExhausted` and the `processPendingTransactions` result `{executions, budgetExhausted}` tell a loop to run again at once; the nodejs CLI (`createProcessingLoop` in `@fuzd/server`) and the Durable Object loops both use it.
- `checkScheduledExecutionStatus` takes no claim: it only marks finalized executions, so overlapping runs repeat a read, not a broadcast.

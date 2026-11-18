---
status: accepted
---

# Due items are claimed with an expiring lease, so processing runs can overlap; on Cloudflare a pool of Durable Object alarm loops runs them back to back

A game reveal makes every player's execution due at the same instant, and each must be broadcast inside a 1h (maybe 2h) window. One Cloudflare cron run handles about 100 to 200 executions (CPU bound, 30s cron limit), and runs once a minute: about 6000 to 12000 per hour at best, with up to a minute of latency (`work/notes/findings/cloudflare-worker-cron-capacity.md`). Going further needs more than one processing run at a time, on one database. Before that is safe, every due item (a `ScheduledExecutions` row for `processQueue`, a `BroadcastedExecutions` row for `processTransactions`) is **claimed** by one run, with a lease. On Cloudflare the runs come from a pool of Durable Objects whose alarms run them back to back while there is work; on nodejs, from the CLI's loop, and several CLI processes may share a database.

## The lease

- Two columns per table: `claimedBy` (the run, `processQueue:<uuid>`) and `claimExpiresAt` (unix ms, real time, not chain time).
- A run claims each batch with ONE statement, `UPDATE ... SET claimedBy, claimExpiresAt WHERE rowid IN (SELECT rowid ... due AND (claimExpiresAt IS NULL OR claimExpiresAt <= now) ORDER BY nextCheckTime LIMIT n) RETURNING *`. SQLite, libsql and D1 (single writer per database) run it atomically, so two runs never get the same row.
- For `processQueue` the claim holds accounts one run at a time (amended, see "Claims per account" below): the first `n` due executions, leaving out every account another run still holds an execution of.
- Writing a row back releases it: the upsert of a scheduled execution and of a pending transaction, and the hash-guarded postpone, set both columns to NULL; an archive deletes the row. At the end of a run, `release...Claims(claimant)` frees anything it still holds (items it skipped, a write that failed), so they do not wait for the lease.
- The lease (`ProcessingBudget.leaseDurationMs`, `PROCESSING_LEASE_DURATION_MS`, 120s by default) is well above a run's duration (its budget stops new batches after 40s). A run that crashed loses its items for at most that long, then any run picks them up again.
- The existing defences stay: the broadcaster lock, and the re-check under it that the slot was not broadcast meanwhile. They now matter only when a lease expires while its run is still working (a run stuck longer than the lease). The residual of `work/tasks/done/drain-reveal-bursts.md` (a late full-row write over `broadcasted = true`) was possible again then, and only then; it is closed by guarded writes (amended, see "Writes of a run only while it holds the claim" below).
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
- Two runs never hold scheduled executions of the same account at the same time (claims per account, below). `processTransactions` holds a broadcaster one run at a time the same way (amended, below). Runs may still meet on a broadcaster shared by many accounts (the payment account helping executions during a gas spike): the broadcaster lock waits up to 1s, then the item is retried after 5s.
- `QueueProcessingResult.budgetExhausted` and the `processPendingTransactions` result `{executions, budgetExhausted}` tell a loop to run again at once; the nodejs CLI (`createProcessingLoop` in `@fuzd/server`) and the Durable Object loops both use it.
- `checkScheduledExecutionStatus` takes no claim: it only marks finalized executions, so overlapping runs repeat a read, not a broadcast.

## Amendment (2026-11-18, later): claims per account

With a claim per row, two runs could hold different due executions of one account. They share the account's broadcaster, so they met on its lock (5 tries 200ms apart, then the loser is retried 5s later), and worse, the nonces followed whichever run took the lock first: in `packages/server/test/parallel-processing.test.ts` ("concurrent processQueue runs over one account"), six moves of one player due one second apart, two runs with batches of 2, got nonces in the order 0, 1, 4, 5, 2, 3. A game's later move must not land before an earlier one.

So an account is held by one run at a time. `claimDueExecutions` still takes the first `limit` due executions in one statement, but leaves out every account that another run holds a live claim on (one of its executions, even one not due any more). The claimant's own accounts are not left out, so its next batch carries on with the rest of an account, in order. Within a batch `processInGroups` keeps the executions of one account sequential, earliest first. An account is free again once the run that held it has written its executions back, so another run may carry on with it from there: the earlier executions are sent by then.

- A batch is still at most `limit` executions, and fewer than `limit` still means nothing more is claimable now (what is left belongs to accounts other runs hold).
- The statement steers SQLite with unary `+` so the held accounts come from the `claimedBy` index (a handful of rows) rather than from the chain's rows. The due executions are read from the due index from the earliest on, until `limit` of them are claimable: rows with a live claim and rows of held accounts are read and skipped, so during a burst with N runs a claim reads up to about N batches of rows more than it claims (D1 bills rows read).
- Considered first: claiming whole accounts (every due execution of each chosen account). Rejected in review: one account with hundreds of due executions would make one batch, unbounded, past the run's budget and possibly its lease and CPU limit, which brings back the overlap it meant to prevent.
- `processTransactions` was first kept with claims per row, since it takes the broadcaster lock only to resubmit a transaction (a gas price bump), not to check one. It now holds broadcasters the same way, for the lock: see the last amendment.
- Considered: keeping the claim per row and documenting the lock contention. Rejected for the nonce order above, which no lock fixes.

## Amendment (2026-11-18, later): writes of a run only while it holds the claim

A run stuck past its lease could still write: another run claims the execution, broadcasts it and writes `broadcasted = true`, then the first run fails (its RPC request, say) and writes its own copy back as not broadcast, with a retry time and an error. It healed at the next processing (the executor answers the existing broadcast), but the execution was queued again for nothing, and an archive by the late run would have deleted a row it no longer owned, or a late write brought back a row another run had archived (the old write was an upsert).

So every write of `processQueue` is guarded by its claim: `SchedulerStorage.updateClaimedExecution(execution, claimant)` is an `UPDATE ... WHERE key AND claimedBy = claimant` (not an upsert: it never re-creates a row), and `archiveClaimedExecution` is one batch that copies the row to the archive only `WHERE EXISTS` the claimed row, then deletes it under the same condition. Both answer whether they applied; when not, the run logs that it no longer holds the execution and moves on. Tested in `packages/server/test/parallel-processing.test.ts` ("that expired while its run was still working") and `packages/server/test/claimed-writes.test.ts`.

- What a user's schedule does is unchanged: `scheduleExecution` still upserts the whole row with `createOrUpdateQueuedExecution`, and that releases any claim. A run then loses its claim to the new schedule, so its late write no longer overwrites the new record either. Refusing a schedule into a spent slot stays `work/tasks/backlog/reject-a-schedule-into-a-spent-slot.md`.
- Considered: a guard that only refuses to turn `broadcasted` from true back to false. Narrower (it lets a late run overwrite every other column of another run's work, re-create an archived row, or archive a row it no longer holds), and it needs telling a user's write from a run's anyway.
- `checkScheduledExecutionStatus` takes no claim. It wrote `finalized = true` with the full-row upsert, so a new schedule written into the slot between its read and its write was overwritten by the old record (found in review). It now sets the flag alone, only while the row is still broadcast (`SchedulerStorage.markExecutionFinalized`).

## Amendment (2026-11-18, later still): processTransactions holds a broadcaster one run at a time

`claimPendingExecutions` leaves out every broadcaster (`BroadcastedExecutions.broadcaster`, the transaction's `from`) another run holds a live claim on, and keeps the claimant's own, as `claimDueExecutions` does for accounts. A run resubmitting the transactions of one broadcaster during a gas spike then never meets another run on that broadcaster's lock. Tested in `packages/server/test/parallel-processing.test.ts` ("on one transaction of a broadcaster keeps its other transactions from other runs").

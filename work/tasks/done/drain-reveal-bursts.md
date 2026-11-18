---
title: Drain a burst of executions due at the same time, and never let failing ones block the queue
slug: drain-reveal-bursts
blockedBy: []
covers: []
---

Built directly on request, for a game whose reveal phase has every player's execution due at the same instant (the start of a 1h, possibly 2h, window), where a reveal not broadcast inside the window is a loss for that player. The measurements that motivated it and the ones after it are in `work/notes/findings/cloudflare-worker-cron-capacity.md`; the load test is `tests/load/reveal-burst.ts` (README beside it).

Before: `processQueue` and `processPendingTransactions` each handled the 10 items with the earliest check time, one after the other, once per cron minute: a ceiling of about 600 reveals per hour on any host (measured: 300 took 29.7 minutes on Cloudflare). Worse, an execution the executor refused (an unfunded remote account, a revert, a lock not obtained) kept its check time, so 10 of them blocked the queue for everyone (red test: 0 of 5 funded players broadcast after 3 runs behind 12 unfunded ones).

## What was built

- `@fuzd/common`: `ProcessingBudget` (`batchSize`, `concurrency`, `maxItemsPerRun`, `maxDurationPerRunMs`; defaults 50 / 10 / 100 / 40s), `processInGroups` (items of one key in order, keys concurrently) and `retryDelaySeconds`.
- `@fuzd/scheduler`: `processQueue` fetches only due executions, chain by chain at that chain's time, in batches until the budget is spent, grouped by `chainId/account`. A failed processing records `lastError`, increments `retries` and reschedules after `retryDelaySeconds`. "Failed to decrypt" now throws into that path (it returned an `archived` status without archiving), and a decryption retry is never scheduled in the past.
- `@fuzd/executor`: `processPendingTransactions` the same way, grouped by broadcaster in nonce order; a transaction checked without being stored again is postponed by 60s (30s after an error) through the new `ExecutorStorage.postponePendingExecution`. `_submitTransaction` re-checks under the broadcaster lock that the slot was not broadcast meanwhile.
- `@fuzd/server`: storage filters (`chainId`, due time) and `postponePendingExecution`, an index on `(chainId, broadcasted, nextCheckTime)`, the budget from `PROCESSING_*` env variables, and `/internal/*` behind admin auth or the instance's own token (`app.internalRequest(action)`).
- `platforms/cf-worker` and `fuzd` (nodejs): crons go through `app.internalRequest`; the CLI does not start an action while its previous run is still going.
- Tests: `packages/server/test/queue-processing.test.ts` (head-of-line with batches smaller than the refused executions, a burst of 60 in one run, one account never sent concurrently, overlapping runs, pending checks in one run with their next check moved forward, the hash guard of the postpone, internal auth, no random values at construction), on the existing in-process harness extended with per-address balances, an RPC call log and a database statement count.

## Acceptance criteria

- [x] Failing executions no longer block the others, and keep their error.
- [x] One run drains a burst within the budget; per-account order is kept.
- [x] Overlapping runs broadcast each execution once (red without the re-check under lock: 50 transactions sent for 30 executions).
- [x] `/internal/*` refuses anonymous requests; the platforms' crons still work (verified deployed on staging).
- [x] The verify gate passes; the end-to-end suite passes.
- [x] Measured on Cloudflare staging: 600 reveals in 6 minutes, 2000 in 10.3 minutes (with 200 per run), all inside the window.
- [x] Changeset for `@fuzd/common`, `@fuzd/scheduler`, `@fuzd/executor`, `@fuzd/server` (minor) and `fuzd` (patch).

## Decisions

- **Retry delay 5s doubling to 2 minutes**, through the existing `retryLater` (which archives after 100 retries, about 3 hours at the cap; expiry usually archives first). Short enough that a player who funds their account late in the window still gets revealed.
- **Due means at the chain's timestamp read once at the start of the run**, per chain, so a chain with its own time (`CONTRACT_TIMESTAMP`) is not compared with another's. An execution handled once in a run is not handled again in that run, even if still due: a safety net against a row that makes no progress looping until the budget is spent.
- **The default budget is 100 per run**, from the measured CPU (4 to 7s per 100, against the 30s cron limit) and 9 statements per execution (about 900 against D1's documented 1000 per invocation). 200 per run worked on staging but took up to 20s of CPU. `maxNumTransactionsToProcessInOneGo` still sizes `checkScheduledExecutionStatus` (not timing-critical), and is deprecated in the executor config.
- **Taking a broadcaster lock waits briefly** (5 attempts, 200ms apart) before failing: broadcasters are now processed concurrently, and the payment account is shared by every execution it helps during a gas spike, which failed at once on contention (found in review). Payment-assisted resubmissions still serialize on that one account; a burst of them is slower than other work.
- **The re-check under lock applies to first submissions only** (not to resubmissions, which carry `forceNonce`/`previouslyStored`).
- **Postponing a pending transaction is a targeted update guarded by its hash**, not a rewrite of the row, so it cannot overwrite a resubmission written meanwhile by an overlapping run.
- **Residual, not fixed**: a run that loses the lock race rewrites the scheduled execution (a full-row upsert) with `broadcasted = false` and a retry time, possibly over the winner's `broadcasted = true`. It heals at the next processing (the executor answers the existing broadcast and the flag is set again), with no second transaction. Guarding the upsert against un-broadcasting would change what a new schedule into a spent slot does, which `work/tasks/backlog/reject-a-schedule-into-a-spent-slot.md` is about.
- **The internal token is per server instance, generated on first use**: a Worker refuses random values at global scope (deploy error 10021, found on the first staging deploy, now covered by a test). Admin Basic auth is accepted too, for an operator.
- **Not in scope**: spreading processing over more than one invocation per minute (needed beyond about 150 to 200 per minute, see the finding), the public read-only admin routes (`work/notes/observations/admin-read-routes-and-dashboard-are-public.md`), and the onion decryption path (`work/notes/observations/onion-decryption-new-payload-is-dropped.md`).

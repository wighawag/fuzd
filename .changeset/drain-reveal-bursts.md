---
'@fuzd/common': minor
'@fuzd/scheduler': minor
'@fuzd/executor': minor
'@fuzd/server': minor
'fuzd': patch
---

Queue processing drains a burst of executions due at the same time, instead of 10 per run. `processQueue` and `processPendingTransactions` now fetch only due items, chain by chain, and keep pulling batches until a processing budget is spent (`ProcessingBudget`, from `@fuzd/common`: 100 items, 40s, 10 concurrent, batches of 50 by default, sized for a Cloudflare cron). Items of different accounts (different broadcasters) run concurrently, those of one account in order. Measured on a Cloudflare Workers staging deployment: 2000 executions scheduled for the same instant were all broadcast within 10.3 minutes (it took 10 minutes per 100 before). `@fuzd/server` reads the budget from `PROCESSING_BATCH_SIZE`, `PROCESSING_CONCURRENCY`, `PROCESSING_MAX_ITEMS_PER_RUN` and `PROCESSING_MAX_DURATION_MS`.

An execution whose processing fails (the executor refused it for lack of balance or a revert, an RPC or drand request failed, the decryption failed) is now rescheduled with its error and a growing delay (5s doubling up to 2 minutes). Before, it stayed first in the queue unchanged, and 10 of them blocked every other execution indefinitely. A broadcast transaction checked without needing action is now checked again 60s later rather than at once, so the same few no longer monopolise `processPendingTransactions`.

The executor checks again, once it holds the broadcaster's lock, that the execution's slot was not broadcast meanwhile: overlapping runs could otherwise send the same execution twice, with two nonces.

The `/internal/*` routes (processQueue, processTransactions, checkScheduledExecutionStatus) now require the admin credentials, or the token of the server instance itself, which the platforms' crons send through the new `app.internalRequest(action)`. They were open to anyone. The `fuzd` CLI no longer starts a run of an action while its previous run is still going.

Storage interfaces: `SchedulerStorage.getQueueTopMostExecutions` and `ExecutorStorage.getPendingExecutions` take optional `chainId` and due-time filters, and `ExecutorStorage` has a new `postponePendingExecution`. The scheduler schema adds the index `idx_ScheduledExecutions_chainId_broadcasted_nextCheckTime` (rerun the setup to create it).

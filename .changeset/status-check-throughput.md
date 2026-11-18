---
'@fuzd/common': minor
'@fuzd/executor': minor
'@fuzd/scheduler': minor
'@fuzd/server': minor
---

`checkScheduledExecutionStatus` keeps up with a burst. It looked at 10 broadcast executions per chain per run, with two statements each, and those not final yet stayed first, so after a reveal of 2000 players finalization took hours, and payment reserves kept counting meanwhile. It now pages through a chain's broadcast executions in batches of the processing batch size, each batch read, checked and written in a few statements, up to `STATUS_CHECK_MAX_PER_RUN` executions per chain per run (1000 by default in `@fuzd/server`; `SchedulerConfig.maxNumTransactionsToProcessInOneGo`, 10 by default, in `@fuzd/scheduler`) and the run's duration budget. Each chain has its own share, so one whose transactions are slow to finalize never keeps the others from being looked at. It reports `budgetExhausted` when a share or the run's time ran out while it was finalizing at least a batch's worth, so a processing loop runs it again at once only when that gets further. A batch whose check fails is reported as `unknown` with its error and looked at again at the next run.

Interfaces: `Executor.getExecutionStatuses(chainId, slots)` (`@fuzd/common`, implemented by `@fuzd/executor`), `ExecutorStorage.getSlotsWithUnfinalizedExecutions`, `SchedulerStorage.markExecutionsFinalized` and the `after` cursor of `getUnFinalizedBroadcastedScheduledExecutions`. The SQL storages bind at most 40 slots per statement (D1 takes 100 bound parameters). The scheduler schema adds the index `idx_ScheduledExecutions_chainId_broadcasted_finalized_nextCheckTime_account_slot` (run `/admin/setup` to create it).

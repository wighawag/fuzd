---
'@fuzd/scheduler': minor
'@fuzd/server': patch
---

`checkScheduledExecutionStatus` looks at configured chains only, chain by chain (up to `maxNumTransactionsToProcessInOneGo` executions each). It read the oldest unfinalized broadcast executions of every chain together, so the rows of a chain no longer configured, whose transactions are never finalized, took every place in every run and no execution of any chain was marked finalized again (their payment reserve kept counting). An execution whose status cannot be read no longer fails the whole run either: it is reported as `unknown` with the error as its reason, and looked at again at the next run.

Storage interface: `SchedulerStorage.getUnFinalizedBroadcastedScheduledExecutions` takes an optional `chainId`, which an implementation must honour.

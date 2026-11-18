---
'@fuzd/executor': minor
'@fuzd/server': minor
---

`processPendingTransactions` holds a broadcaster one run at a time: a claim leaves out every broadcaster another run still holds a pending transaction of, and keeps the claimant's own. Two overlapping runs resubmitting transactions of one broadcaster (a gas spike) met on its lock before, the loser retrying later. `ExecutorStorage.claimPendingExecutions` must leave out the broadcasters other claimants hold; `RemoteSQLExecutorStorage` does it in the same single statement. The Cloudflare Worker's processing loops (`platforms/cf-worker`) get it through `@fuzd/server`.

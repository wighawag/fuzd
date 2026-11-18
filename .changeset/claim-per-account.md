---
'@fuzd/scheduler': minor
'@fuzd/server': minor
---

`processQueue` holds an account one run at a time: a claim leaves out every account another run still holds an execution of, so the executions of one account are sent by one run at a time, in order. With a claim per execution, two overlapping runs could each take some executions of one account; they met on its broadcaster lock (the loser retried 5s later), and the nonces followed whichever run took the lock first, so a later execution could be sent before an earlier one.

`SchedulerStorage.claimDueExecutions` must now leave out the accounts other claimants hold, and keep the claimant's own; `RemoteSQLSchedulerStorage` does it in the same single statement. See the amendment of `docs/adr/0004-claim-due-items-with-a-lease.md`. The Cloudflare Worker (`platforms/cf-worker`) gets it through `@fuzd/server`: its processing loops no longer wait on each other for one player's moves.

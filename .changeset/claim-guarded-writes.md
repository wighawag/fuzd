---
'@fuzd/scheduler': minor
'@fuzd/server': minor
---

A `processQueue` run writes an execution back, or archives it, only while it still holds its claim. A run stuck past its lease could write its copy over what another run did since: a broadcast (writing `broadcasted = false` and a retry, so the execution was queued again for nothing), or an archive (the row brought back). And any run in flight overwrote a new schedule written into the slot meanwhile with the old record. Now such a write does nothing and the run logs that it no longer holds the execution. `checkScheduledExecutionStatus` now sets `finalized` alone, and only while the execution is still broadcast: its full-row write could overwrite a new schedule written into the slot meanwhile. What a user's `scheduleExecution` does is unchanged.

Storage interface: `SchedulerStorage` has `updateClaimedExecution(execution, claimant)` and `archiveClaimedExecution(execution, claimant)`, which apply only while `claimant` holds the claim and answer whether they did, and `markExecutionsFinalized({chainId, slots})`; `RemoteSQLSchedulerStorage` implements them as guarded `UPDATE`s and a guarded archive batch. See the amendment of `docs/adr/0004-claim-due-items-with-a-lease.md`.

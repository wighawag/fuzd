---
title: A processQueue run writes an execution back only while it holds its claim
slug: claim-guarded-writes
blockedBy: [parallel-processing]
covers: []
---

Built directly on request, closing the residual of `work/tasks/done/drain-reveal-bursts.md` that leases had narrowed to a run outliving its lease. The decision and the option compared are the amendment "Writes of a run only while it holds the claim" of `docs/adr/0004-claim-due-items-with-a-lease.md`.

## What was built

- `SchedulerStorage.updateClaimedExecution(execution, claimant)` (a guarded `UPDATE ... WHERE key AND claimedBy = claimant RETURNING`, never an insert) and `archiveClaimedExecution(execution, claimant)` (one batch: the archive row inserted `WHERE EXISTS` the claimed row, then the row deleted under the same condition); both answer whether they applied.
- Every write of `processQueue` goes through them (`writeClaimed`, `archiveClaimed` in `packages/scheduler/src/scheduler.ts`, the claimant passed down to `processExecution`, `execute`, `checkAndUpdateExecutionIfNeeded`, `retryLater` and `retryAfterFailure`); a write that did not apply is logged as a warning. `scheduleExecution` keeps the full-row upsert.
- `checkScheduledExecutionStatus` sets `finalized` alone with `SchedulerStorage.markExecutionFinalized`, only while the row is still broadcast (found in review: its full-row upsert overwrote a new schedule written into the slot between its read and its write).
- Tests in `packages/server/test/parallel-processing.test.ts`: a run stuck before its broadcast while its lease expires, another run broadcasts the execution, then the first one fails and writes back: the row stays broadcast, with no retry and no error, and one transaction was sent (red before: `broadcasted = 0`, `retries = 1`); a new schedule into the slot while a run broadcasts the old one: the new schedule stays, queued (red before: overwritten by the old record, broadcast). `packages/server/test/claimed-writes.test.ts` covers the storage methods directly (written with them, not before, except `markExecutionFinalized`, whose two tests were red first).

## Acceptance criteria

- [x] A run whose lease expired while another run broadcast the execution cannot write `broadcasted = false` over it.
- [x] What a user's re-schedule does is unchanged; `work/tasks/backlog/reject-a-schedule-into-a-spent-slot.md` stays separate (its "race with an in-flight processQueue" limit is updated: now closed).
- [x] The verify gate passes; changeset (`@fuzd/scheduler`, `@fuzd/server`: minor).

## Decisions

- **Guarded by the claim, not by "never un-broadcast"**: see the ADR amendment. The claim also plays the part of the version column the backlog task asked for, because a schedule's upsert releases the claim.
- **A write that did not apply is not an error**: the status the run reports for that execution is still what it did (it broadcast, or got the existing broadcast back).

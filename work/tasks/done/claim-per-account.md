---
title: processQueue holds an account one run at a time, so its executions are sent in order
slug: claim-per-account
blockedBy: [parallel-processing]
covers: []
---

Built directly on request, after `parallel-processing`. The decision and its reasons are the amendment "Claims per account" of `docs/adr/0004-claim-due-items-with-a-lease.md`.

## What was built

- `RemoteSQLSchedulerStorage.claimDueExecutions`: still one statement over the first `limit` due executions, now leaving out every account another run holds a live claim on; the claimant's own accounts stay in, so its next batch carries on with them.
- `SchedulerStorage.claimDueExecutions` documents it; `processQueue` is unchanged otherwise (`processInGroups` already runs one account's executions one after the other, earliest first).
- Tests in `packages/server/test/parallel-processing.test.ts`: six executions of one player due one second apart, two concurrent runs with batches of 2: each handled once, nonces 0 to 5 in slot order, no lock error, every row broadcast, no claim left (red before: the nonces went 0, 1, 4, 5, 2, 3); a live claim of another run on one execution of an account keeps its other due execution from a run, while the other accounts are processed (red before).

## Acceptance criteria

- [x] Two concurrent runs over several due executions of one account: all broadcast in nonce order in one round, no "could not lock broadcaster".
- [x] The decision recorded (ADR 0004 amended).
- [x] The verify gate passes; changeset (`@fuzd/scheduler`, `@fuzd/server`: minor).

## Decisions

- **Per account rather than documenting the contention**: the lock contention was the smaller problem; the nonce order following whichever run took the lock first is not something a lock fixes.
- **One run at a time, not whole accounts per claim** (changed in review): claiming every due execution of each chosen account made a batch unbounded for an account with many due executions, past the run's budget and possibly its lease. Leaving out the accounts other runs hold gives the same order with batches of at most `limit`.
- **The query plan was checked** (`EXPLAIN QUERY PLAN` on libsql): unary `+` keeps the held accounts on the `claimedBy` index; the due rows are read from the due index, earliest first, skipping claimed rows and rows of held accounts until `limit` are claimable.
- **`processTransactions` keeps claims per row**: it takes the broadcaster lock only to resubmit, and already sorts by nonce within a run.

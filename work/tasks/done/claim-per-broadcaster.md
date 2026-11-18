---
title: processTransactions holds a broadcaster one run at a time
slug: claim-per-broadcaster
blockedBy: [claim-per-account]
covers: []
---

Built directly on request, from the "found but not fixed" list: `claim-per-account` left `processTransactions` with claims per row, so two runs resubmitting transactions of one broadcaster (a gas spike) could still meet on its lock. Recorded as the last amendment of `docs/adr/0004-claim-due-items-with-a-lease.md`.

## What was built

- `RemoteSQLExecutorStorage.claimPendingExecutions` leaves out every broadcaster another run holds a live claim on, and keeps the claimant's own, in the same single statement (the held broadcasters read from the `claimedBy` index; plan checked).
- `ExecutorStorage.claimPendingExecutions` documents it.
- Test in `packages/server/test/parallel-processing.test.ts`: three pending transactions of one broadcaster, one held by another run, and two of other players: a run checks only the other players' (red before: it took the held broadcaster's two others too).

## Acceptance criteria

- [x] No two runs hold pending transactions of one broadcaster at once.
- [x] The verify gate passes; changeset (`@fuzd/executor`, `@fuzd/server`: minor).

## Decisions

- **Keyed by `broadcaster`** (the transaction's `from`), not the user account: the lock is the broadcaster's, and the payment account's transactions (helping others during a gas spike) share it across accounts.

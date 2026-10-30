---
title: Refuse a schedule into a slot that has already been broadcast
slug: reject-a-schedule-into-a-spent-slot
blockedBy: []
covers: []
---

## Why

Measured on 2026-10-30 against the published `fuzd` 0.12.0 CLI (`@fuzd/server` 0.12.1, `@fuzd/scheduler` 0.11.1) on a local anvil, while building template-commit-reveal's `with/fuzd` (stratagems' plan, step 8, item 5): a `scheduleExecution` into a slot whose batch had already been broadcast and finalised answered `success: true`, and the new transaction was never sent (the remote account's balance did not move), while the routes reported the slot broadcast and finalised with the FIRST batch's transaction.

The code explains it:

- `scheduleExecution` upserts the new record with `broadcasted: false, finalized: false` (`packages/scheduler/src/scheduler.ts:84-92`), and the storage overwrites every column on conflict (`packages/server/src/storage/RemoteSQLSchedulerStorage.ts:180`), so the spent slot is queued again (`getQueueTopMostExecutions` selects `broadcasted = FALSE`, `:187`).
- `execute()` then calls `executor.broadcastExecution` per batch index (`scheduler.ts:186-204`), which finds the existing executor row for `(chainId, account, slot, batchIndex)` and returns it with `slotAlreadyUsed: true` without sending (`packages/executor/src/executor.ts:208-216`). The scheduler ignores the flag and marks the slot broadcasted (`scheduler.ts:213-214`); the authors left a TODO for exactly this (`scheduler.ts:206-207`). `checkScheduledExecutionStatus` reads the old batch's finalised rows and marks it finalised (`scheduler.ts:550-555`).
- So the new transactions at batch indices the first batch already used are never sent. A LONGER new batch does send its extra indices, under a slot whose earlier transactions belong to another batch.

While the slot is still queued (nothing of it broadcast), replacing it is the intended behaviour and works.

The maintainer's decision (2026-10-30): reject it. Accepting it and broadcasting it as a new batch would also be coherent, but a slot that means "replace" before its broadcast and "add" after it is confusing.

## What to build

`scheduleExecution` in `@fuzd/scheduler` refuses a submission into a SPENT slot: one whose queued record is `broadcasted`, OR for which the executor holds a record at any batch index (`executor.getExecutionStatus({chainId, account, slot})`, the call `checkScheduledExecutionStatus` already makes). It throws before the upsert, so the server route answers HTTP 500 with `createErrorObject`'s body, `{success: false, errors: [{message, ...}]}`, the message naming `(chainId, account, slot)` as already used. This is unlike `broadcastExecution`, which answers success with the existing execution and `slotAlreadyUsed: true`; a schedule is refused outright. A slot that is merely queued (no executor record at any batch index) keeps being replaced, as today. A slot whose earlier schedule was archived without anything being broadcast is free and is accepted.

## Acceptance criteria

- [ ] A schedule into a queued slot (no executor record at any batch index) replaces it: only the new batch is broadcast, as today.
- [ ] A schedule into a slot already broadcast (pending or finalised) is refused: the route answers HTTP 500 with `{success: false, errors: [{message}]}`, the message naming the slot as used, nothing is stored, and the first batch's records are untouched.
- [ ] A schedule into a PARTIALLY broadcast slot (some batch indices broadcast, the queued record not yet marked) is refused too.
- [ ] A schedule into a slot whose earlier schedule was archived without any broadcast is accepted.
- [ ] Tests cover these in the in-process server tests (`packages/server/test`: scratch database, mock RPC), driving `/internal/processQueue`; at minimum the already-broadcast-pending case, and the finalised one if the mock RPC is extended to answer receipts. `@fuzd/client`'s HTTP path then returns that body unchanged (note that its declared failure type, `{success: false; error}`, does not match the server's `errors`; fix the type or say why not), and its function-endpoint path throws instead; say which one a test covers.
- [ ] A changeset for `@fuzd/scheduler` (and `@fuzd/server` if its code changes; it is otherwise bumped as an internal dependency), stating the bump level: this changes behaviour.

## Out of scope / known limits

- A slot freed by the admin prune routes (`deleteFinalizedScheduledExecutions`, `deleteFinalizedPendingExecutions`) is indistinguishable from a fresh one and is accepted again.
- A race with an in-flight `processQueue`: `execute()` holds the old record in memory and upserts it with `broadcasted: true` after broadcasting (`scheduler.ts:213-214`), so a schedule landing between the queue read and that write passes the new check and is then overwritten. A `WHERE broadcasted = 0` guard does NOT close it (the overwritten row is the new one, still unbroadcast). Closing it needs `execute()`'s write-back to be conditional on the row still being the record it read (a version column, or `checkinTime` plus a payload hash), with the `slotAlreadyUsed` check in `execute()` catching the newer record when it is processed next. Out of scope unless the builder chooses otherwise; record the choice in the done task.

## Blocked by

- None: can start immediately.

## Prompt

In fuzd (`@fuzd/scheduler`, `packages/scheduler/src/scheduler.ts`), make `scheduleExecution` refuse a schedule into a slot that has already been broadcast, as this task's "What to build" says. Before the upsert (`storage.createOrUpdateQueuedExecution`), read the queued record (`storage.getQueuedExecution`) and the executor's records for the slot (`executor.getExecutionStatus({chainId, account, slot})`); if the record is `broadcasted` or the executor holds any batch index, throw an error naming `(chainId, account, slot)` as already used. Resolve the TODO at `scheduler.ts:206-207` in the same spirit, or say why not. Test first in `packages/server/test` (its scratch-database server and mock RPC), driving `/internal/processQueue` to broadcast, covering the cases as the tests criterion states, and say in the done task which cases are covered. First check that the code still matches the file:line references in "Why" (they were read at fuzd `main` cd6a5f5); if it does not, update the task before building. Record the decisions you make (where the check lives, the race, the bump level) in the done task, and add the changeset.

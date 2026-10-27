---
title: A scheduled execution already carries several transactions; only fuzd-client sends one
slug: scheduled-execution-batch-is-already-multi-transaction
source: 'derived from reading packages/scheduler/src/scheduler.ts, packages/client/src/index.ts and packages/server/src/schemas/index.ts @ 7619366 (branch feat/zod-validation), 2026-10-27'
---

Context for the multi-transaction submission in `fuzd-client` needed by stratagems' step 8 (`work/plans/join-template-commit-reveal.md` on stratagems' `join-template-commit-reveal` branch). Not built here.

- The wire type already allows it: `ScheduledExecution<ExecutionSubmission<T>>` has `executions: ExecutionSubmission<T>[]` for `type: 'clear'`, and a time-locked payload decrypts to `DecryptionResult` with `executions: T[]`. `POST /api/scheduling/scheduleExecution` validates the whole array (`ScheduledExecutionSchema`), so no server or route change is needed.
- The scheduler broadcasts them in array order, sequentially (`for (let i = 0; i < executions.length; i++)`, awaiting each `executor.broadcastExecution(slot, i, ...)`), with `batchIndex = i`, the same `slot`, `account`, `onBehalf`, `expiryTime` and `initialTime` for all, and `trusted: true` (service parameters were checked at scheduling time). The schedule is marked `broadcasted` only after the loop: if one broadcast throws, the scheduler retries the whole batch later, and the executor skips the indices it already stored (`slotAlreadyUsed`).
- Each transaction is then readable on its own at `GET /api/execution/execution/:chainId/:account/:slot/:batchIndex`.
- `fuzd-client` builds `executions: [execution]` (one item) in both its clear and time-locked paths (`scheduleExecution` in `packages/client/src/index.ts`); its public `scheduleExecution` signature takes a single transaction. That signature is where a multi-transaction submission changes the public API of `fuzd-client`.
- Ordering is "broadcast in order", not "mined in order": each gets its own nonce from the broadcaster in sequence, which gives on-chain order for one broadcaster on EVM; nothing ties a later transaction to the success of an earlier one.

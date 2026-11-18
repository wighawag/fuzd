---
title: checkScheduledExecutionStatus keeps up with a burst, in a few statements per batch
slug: status-check-throughput
blockedBy: [status-check-configured-chains]
covers: []
---

Built directly on request, from the "found but not fixed" list of the previous round: the status check looked at 10 broadcast executions per chain per run (every 2 minutes on Cloudflare), with two statements each, and those not final yet stayed first. After a 2000-player reveal, finalization would have taken about 400 minutes, with payment reserves counting until then.

## What was built

- `@fuzd/scheduler`: `checkScheduledExecutionStatus` pages through each configured chain's broadcast executions (`getUnFinalizedBroadcastedScheduledExecutions` with an `after` cursor on checkin time, account and slot), in batches of `processing.batchSize`, up to `maxNumTransactionsToProcessInOneGo` executions per chain per run and `maxDurationPerRunMs` for the run. Per batch: one read, `executor.getExecutionStatuses` and `storage.markExecutionsFinalized`. A batch whose check fails is reported `unknown` with its error; the run goes on.
- `@fuzd/common` / `@fuzd/executor`: `Executor.getExecutionStatuses(chainId, slots)`, from `ExecutorStorage.getSlotsWithUnfinalizedExecutions`; a slot without transactions counts as finalized, as `getExecutionStatus` does.
- `@fuzd/server`: both SQL methods bind at most 40 slots per statement (`MAX_SLOTS_PER_STATEMENT`, D1's limit is 100 bound parameters); `markExecutionsFinalized` (replacing the single `markExecutionFinalized` of `claim-guarded-writes`, unreleased) sets `finalized` alone and only where still broadcast; `STATUS_CHECK_MAX_PER_RUN` (1000 by default); a new index `(chainId, broadcasted, finalized, nextCheckTime, account, slot)` for the paging.
- Tests in `packages/server/test/status-check.test.ts`: 45 broadcast executions, 6 not final before and 6 after 33 final ones: the 33 finalized in one run, in at most 6 statements (red before: `0/45`); a cap of 4 with batches of 2 reports `budgetExhausted` and the next run finishes (red before); a failing batch write (a spy on `markExecutionsFinalized`) leaves the other batch finalized and is done at the next run (red before: no such method); a first chain with more executions not final than a run looks at does not keep the second chain from being finalized, and the run does not ask to run again (red before, found in review: the share was counted across chains). `claimed-writes.test.ts` covers `markExecutionsFinalized` (the guard, and 95 slots over 3 statements).

## Acceptance criteria

- [x] One run finalizes everything final among the first `STATUS_CHECK_MAX_PER_RUN`, past the ones not final.
- [x] A few statements per batch, not two per execution.
- [x] The verify gate passes; changeset (`@fuzd/common`, `@fuzd/executor`, `@fuzd/scheduler`, `@fuzd/server`: minor).

## Decisions

- **Every run starts from the oldest** (no cursor kept between runs): there is nowhere to keep one, and the executions not final yet are what moves. So `budgetExhausted` is reported only when a chain's share, or the run's time, ran out while it was finalizing at least a batch's worth; one that finalized few would mostly read the same executions again, and a processing loop (`createProcessingLoop` on nodejs) would spin on it while transactions wait for finality.
- **A share per chain** (found in review): with one share for the whole run, a first chain full of executions not final yet (a chain whose RPC is down, say) kept every later chain from being looked at.
- **1000 per chain per run by default**: a batch of 50 is about 4 statements, so 1000 is about 80, far below D1's 1000 queries per invocation, and within one cron every 2 minutes a 2000-player reveal is finalized in about two runs once its transactions are final.
- **Query plans checked** (`EXPLAIN QUERY PLAN` on libsql): the page read uses the new index without a sort, and the slot lists use the account index (unary `+` on chainId and the flags), not every unfinalized row of the chain.
- **The status check still runs from the crons only on Cloudflare**, not from the Durable Object loops: each alarm would add those reads every 5s for nothing while transactions wait for finality.

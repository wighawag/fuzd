---
title: checkScheduledExecutionStatus looks at configured chains only, and goes on past a failing execution
slug: status-check-configured-chains
blockedBy: []
covers: []
---

Built directly on request. `checkScheduledExecutionStatus` (`packages/scheduler/src/scheduler.ts`) read the oldest unfinalized broadcast executions of every chain together (`getUnFinalizedBroadcastedScheduledExecutions` had no chain filter), 10 at a time.

## What was built

- `SchedulerStorage.getUnFinalizedBroadcastedScheduledExecutions` takes an optional `chainId`; `RemoteSQLSchedulerStorage` filters on it.
- `checkScheduledExecutionStatus` goes chain by chain over the configured chains (`Object.keys(chainProtocols)`, as `processQueue` does), up to `maxNumTransactionsToProcessInOneGo` executions per chain, and catches the failure of one execution: it is reported as `unknown` with the error as its reason, and the run goes on.
- The test harness exposes `env` (`packages/server/test/utils/server.ts`), so a test can drop a chain between requests.
- Tests `packages/server/test/status-check.test.ts`: 12 broadcast executions of a chain no longer configured, older than 3 of a configured one whose transactions are final: the 3 are finalized (red before: `0/3`); an execution whose stored transaction no longer parses does not stop the 3 others (red before: HTTP 500).

## Acceptance criteria

- [x] Rows of an unconfigured chain plus a configured one: the configured one gets finalized.
- [x] One failing execution does not stop the others.
- [x] Changeset (`@fuzd/scheduler`: minor, the storage interface; `@fuzd/server`: patch).

## Decisions

- **What actually stalled it.** `executor.getExecutionStatus` does not throw for an unconfigured chain: it only reads the executor's storage, and answers `broadcasted` while the chain's transactions are not final, which they never become, since `processTransactions` only works on configured chains. Those rows then took all 10 places of every run, oldest first, and nothing else was ever looked at again. The failure isolation is for any other error (a database error, a row that no longer parses).
- **A failing execution is not postponed.** Postponing would mean moving its `nextCheckTime`, which for a broadcast execution is its check-in time: shown to the user (`checkinTime`), and the cutoff of `deleteFinalizedScheduledExecutions`. It is looked at again at the next run instead. Known limit: an execution that fails every time keeps one of the 10 places of its chain.
- **Per chain, not global, limit**: a run now looks at up to 10 executions per configured chain.

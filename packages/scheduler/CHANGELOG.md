# @fuzd/scheduler

## 0.12.0

### Minor Changes

- 634d9b2: Processing runs may now overlap safely: several crons, loops or processes on one database. `processQueue` and `processPendingTransactions` claim each batch of due items in one atomic statement, for a lease (`ProcessingBudget.leaseDurationMs`, `PROCESSING_LEASE_DURATION_MS`, 2 minutes by default), so two runs never process the same execution, and the items of a run that crashed come back once its lease expires. Writing an item back releases it, and a run releases whatever it still holds when it ends. See `docs/adr/0004-claim-due-items-with-a-lease.md`.

  A run now says when it stopped on its budget rather than for lack of due work: `QueueProcessingResult.budgetExhausted`, and `processPendingTransactions` returns `{executions, budgetExhausted}` (it returned the executions typed as `void`); `/internal/processTransactions` answers `budgetExhausted` beside `transactions`. `@fuzd/server` exports `createProcessingLoop(app, {intervalMs})`, which runs each action back to back while its runs stop on their budget, and every `intervalMs` otherwise, and `runInternalAction`.

  Storage interfaces: `SchedulerStorage` has `claimDueExecutions` and `releaseExecutionClaims`, `ExecutorStorage` has `claimPendingExecutions` and `releasePendingExecutionClaims`. The SQL storages add the columns `claimedBy` and `claimExpiresAt` to `ScheduledExecutions` and `BroadcastedExecutions`, with an index on `claimedBy`.

  Upgrading an existing database: every write of this version names the new columns, so until they exist, scheduling and processing fail. `/admin/setup` adds them (and the indexes), so run it right after deploying; the schema files alone (`init-db`) do not add columns to an existing table. To have no gap at all, add the columns before deploying (the previous version ignores them):

  ```sql
  ALTER TABLE ScheduledExecutions ADD COLUMN claimedBy text;
  ALTER TABLE ScheduledExecutions ADD COLUMN claimExpiresAt integer;
  ALTER TABLE BroadcastedExecutions ADD COLUMN claimedBy text;
  ALTER TABLE BroadcastedExecutions ADD COLUMN claimExpiresAt integer;
  ```

  then run `/admin/setup` after deploying for the indexes.

  The `fuzd` CLI runs each action back to back during a burst, and every `--process-interval` when idle. Several `fuzd` processes may share one database.

  The Cloudflare Worker (`platforms/cf-worker`, not published) now runs `processQueue` and `processTransactions` from a pool of Durable Object alarm loops (`ProcessingLoop`, migration `v1-processing-loop`), one by default (`PROCESSING_LOOPS`), each waking every 5s when idle (`PROCESSING_LOOP_IDLE_MS`) and back to back during a burst; the crons keep running as a fallback. Measured on staging, 2000 reveals due at once: 1.3 minutes with 8 loops, 2.8 with 4, against about 20 with the crons alone.

- ef023b9: A `processQueue` run writes an execution back, or archives it, only while it still holds its claim. A run stuck past its lease could write its copy over what another run did since: a broadcast (writing `broadcasted = false` and a retry, so the execution was queued again for nothing), or an archive (the row brought back). And any run in flight overwrote a new schedule written into the slot meanwhile with the old record. Now such a write does nothing and the run logs that it no longer holds the execution. `checkScheduledExecutionStatus` now sets `finalized` alone, and only while the execution is still broadcast: its full-row write could overwrite a new schedule written into the slot meanwhile. What a user's `scheduleExecution` does is unchanged.

  Storage interface: `SchedulerStorage` has `updateClaimedExecution(execution, claimant)` and `archiveClaimedExecution(execution, claimant)`, which apply only while `claimant` holds the claim and answer whether they did, and `markExecutionsFinalized({chainId, slots})`; `RemoteSQLSchedulerStorage` implements them as guarded `UPDATE`s and a guarded archive batch. See the amendment of `docs/adr/0004-claim-due-items-with-a-lease.md`.

- ce469f4: `processQueue` holds an account one run at a time: a claim leaves out every account another run still holds an execution of, so the executions of one account are sent by one run at a time, in order. With a claim per execution, two overlapping runs could each take some executions of one account; they met on its broadcaster lock (the loser retried 5s later), and the nonces followed whichever run took the lock first, so a later execution could be sent before an earlier one.

  `SchedulerStorage.claimDueExecutions` must now leave out the accounts other claimants hold, and keep the claimant's own; `RemoteSQLSchedulerStorage` does it in the same single statement. See the amendment of `docs/adr/0004-claim-due-items-with-a-lease.md`. The Cloudflare Worker (`platforms/cf-worker`) gets it through `@fuzd/server`: its processing loops no longer wait on each other for one player's moves.

- 78c897b: Queue processing drains a burst of executions due at the same time, instead of 10 per run. `processQueue` and `processPendingTransactions` now fetch only due items, chain by chain, and keep pulling batches until a processing budget is spent (`ProcessingBudget`, from `@fuzd/common`: 100 items, 40s, 10 concurrent, batches of 50 by default, sized for a Cloudflare cron). Items of different accounts (different broadcasters) run concurrently, those of one account in order. Measured on a Cloudflare Workers staging deployment: 2000 executions scheduled for the same instant were all broadcast within 10.3 minutes (it took 10 minutes per 100 before). `@fuzd/server` reads the budget from `PROCESSING_BATCH_SIZE`, `PROCESSING_CONCURRENCY`, `PROCESSING_MAX_ITEMS_PER_RUN` and `PROCESSING_MAX_DURATION_MS`.

  An execution whose processing fails (the executor refused it for lack of balance or a revert, an RPC or drand request failed, the decryption failed) is now rescheduled with its error and a growing delay (5s doubling up to 2 minutes). Before, it stayed first in the queue unchanged, and 10 of them blocked every other execution indefinitely. A broadcast transaction checked without needing action is now checked again 60s later rather than at once, so the same few no longer monopolise `processPendingTransactions`.

  The executor checks again, once it holds the broadcaster's lock, that the execution's slot was not broadcast meanwhile: overlapping runs could otherwise send the same execution twice, with two nonces.

  The `/internal/*` routes (processQueue, processTransactions, checkScheduledExecutionStatus) now require the admin credentials, or the token of the server instance itself, which the platforms' crons send through the new `app.internalRequest(action)`. They were open to anyone. The `fuzd` CLI no longer starts a run of an action while its previous run is still going.

  Storage interfaces: `SchedulerStorage.getQueueTopMostExecutions` and `ExecutorStorage.getPendingExecutions` take optional `chainId` and due-time filters, and `ExecutorStorage` has a new `postponePendingExecution`. The scheduler schema adds the index `idx_ScheduledExecutions_chainId_broadcasted_nextCheckTime` (rerun the setup to create it).

- d63f9c0: A twice time-locked ("onion") execution now reaches its inner transaction. When the decrypted payload is itself `time-locked`, the scheduler stores that inner payload and its timing and waits for the inner time; before, it kept the outer layer, decrypted it again at every check-in and never broadcast. From then on the inner timing decides the check-in time and the expiry (counted from the inner time, with the inner `expiryDelta`, or the outer one when the inner layer has none).

  `@fuzd/tlock-decrypter` accepted no inner timing at all (its check was inverted: it threw for exactly the supported `fixed-time`, `fixed-round` and `delta-time-with-target-time`), and for `delta-time-with-target-time` it took the target time for a drand round. It now refuses only an inner timing that cannot be time-locked.

  `@fuzd/server`: `ServerOptions.getDrandClient` sets the drand network time-locked executions are decrypted with (drand mainnet when not given).

- a86ddf2: `scheduleExecution` refuses a schedule into a slot that has already been broadcast: it throws `cannot proceed. the slot (chainId: ..., account: ..., slot: ...) has already been used: ...`, and `@fuzd/server`'s `/api/scheduling/scheduleExecution` answers HTTP 500 with `{success: false, errors: [{message}]}`. A slot is spent once its queued record is marked broadcasted or the executor holds a record for any of its batch indices (so a partially broadcast batch spends it too). Before, the schedule answered `success: true` and was never sent: the executor found the earlier batch's records and returned them with `slotAlreadyUsed` without sending, and only the indices beyond the earlier batch's length were broadcast. A slot that is only queued is still replaced by a new schedule, and a slot whose schedule was archived before anything was broadcast is free again. Schedule into a new slot instead. A schedule into a slot that a processing run holds right now is refused too (`cannot proceed. the slot (...) is being processed, or was just broadcast: try again in a moment, and schedule into a new slot if it is refused as used.`): until the executor has stored what it sends, such a slot looks free, and a schedule accepted then would never be sent. A direct broadcast (`/api/execution/broadcastExecution`) into a slot that holds a queued schedule is refused as well (`cannot proceed. the slot (...) has a queued schedule ...`), unless it is the schedule's own transaction (a one-transaction schedule in clear): that is sent now, and the schedule finds it sent. And a schedule that finds, when it runs, that another execution took its slot after it was accepted (a direct broadcast in flight when it was scheduled) is archived with that as its `lastError`, instead of being marked broadcast without being sent; none of its later batch indices is sent then (the error says how many were).

  Storage interface: `SchedulerStorage.queueExecution(execution, {now})` stores a new schedule in one atomic upsert, unless the slot's queued execution is broadcast or held by a run, and answers whether it did; `RemoteSQLSchedulerStorage` implements it, and `scheduleExecution` writes with it. `@fuzd/executor`: `broadcastExecution` answers `slotAlreadyUsed` also when it finds the slot used once it holds the broadcaster lock (it returned the record unflagged). `@fuzd/common` exports `sameTransaction(a, b)`.

- 52e27a9: `checkScheduledExecutionStatus` looks at configured chains only, chain by chain (up to `maxNumTransactionsToProcessInOneGo` executions each). It read the oldest unfinalized broadcast executions of every chain together, so the rows of a chain no longer configured, whose transactions are never finalized, took every place in every run and no execution of any chain was marked finalized again (their payment reserve kept counting). An execution whose status cannot be read no longer fails the whole run either: it is reported as `unknown` with the error as its reason, and looked at again at the next run.

  Storage interface: `SchedulerStorage.getUnFinalizedBroadcastedScheduledExecutions` takes an optional `chainId`, which an implementation must honour.

- 7175a77: `checkScheduledExecutionStatus` keeps up with a burst. It looked at 10 broadcast executions per chain per run, with two statements each, and those not final yet stayed first, so after a reveal of 2000 players finalization took hours, and payment reserves kept counting meanwhile. It now pages through a chain's broadcast executions in batches of the processing batch size, each batch read, checked and written in a few statements, up to `STATUS_CHECK_MAX_PER_RUN` executions per chain per run (1000 by default in `@fuzd/server`; `SchedulerConfig.maxNumTransactionsToProcessInOneGo`, 10 by default, in `@fuzd/scheduler`) and the run's duration budget. Each chain has its own share, so one whose transactions are slow to finalize never keeps the others from being looked at. It reports `budgetExhausted` when a share or the run's time ran out while it was finalizing at least a batch's worth, so a processing loop runs it again at once only when that gets further. A batch whose check fails is reported as `unknown` with its error and looked at again at the next run.

  Interfaces: `Executor.getExecutionStatuses(chainId, slots)` (`@fuzd/common`, implemented by `@fuzd/executor`), `ExecutorStorage.getSlotsWithUnfinalizedExecutions`, `SchedulerStorage.markExecutionsFinalized` and the `after` cursor of `getUnFinalizedBroadcastedScheduledExecutions`. The SQL storages bind at most 40 slots per statement (D1 takes 100 bound parameters). The scheduler schema adds the index `idx_ScheduledExecutions_chainId_broadcasted_finalized_nextCheckTime_account_slot` (run `/admin/setup` to create it).

### Patch Changes

- Updated dependencies [634d9b2]
- Updated dependencies [78c897b]
- Updated dependencies [a86ddf2]
- Updated dependencies [7175a77]
  - @fuzd/common@0.12.0
  - @fuzd/chain-protocol@0.11.2

## 0.11.1

### Package name

- Published as `@fuzd/scheduler`, previously `fuzd-scheduler`. Same code; `fuzd-scheduler` stops at its last version and is deprecated.

### Patch Changes

- Updated dependencies [fdeaaab]
  - fuzd-common@0.11.1
  - fuzd-chain-protocol@0.11.1

## 0.11.0

### Minor Changes

- update

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.11.0
  - fuzd-common@0.11.0

## 0.10.0

### Minor Changes

- release

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.10.0
  - fuzd-common@0.10.0

## 0.9.7

### Patch Changes

- fixes + allow more timing options

## 0.9.6

### Patch Changes

- targetTimeUnlessHigherDelta + expiryDelta

## 0.9.5

### Patch Changes

- crititialDelta
- Updated dependencies
  - fuzd-common@0.9.4
  - fuzd-chain-protocol@0.9.5

## 0.9.4

### Patch Changes

- Updated dependencies
  - fuzd-common@0.9.3
  - fuzd-chain-protocol@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [1e8f8b0]
- Updated dependencies [5279cf2]
  - fuzd-common@0.9.2
  - fuzd-chain-protocol@0.9.3

## 0.9.2

### Patch Changes

- replaced tx status
- Updated dependencies
  - fuzd-chain-protocol@0.9.2

## 0.9.1

### Patch Changes

- fixes + bestTime
- Updated dependencies
  - fuzd-chain-protocol@0.9.1
  - fuzd-common@0.9.1

## 0.9.0

### Minor Changes

- some changes

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.9.0
  - fuzd-common@0.9.0

## 0.8.0

### Minor Changes

- refactor

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.8.0
  - fuzd-common@0.8.0

## 0.7.4

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.7.4

## 0.7.3

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.7.3

## 0.7.2

### Patch Changes

- cli for nodejs + autoSetupDB
- Updated dependencies
  - fuzd-chain-protocol@0.7.2
  - fuzd-common@0.7.2

## 0.7.1

### Patch Changes

- tlock-js from drand
- Updated dependencies
  - fuzd-chain-protocol@0.7.1
  - fuzd-common@0.7.1

## 0.7.0

### Minor Changes

- major refactor

### Patch Changes

- Updated dependencies
  - fuzd-chain-protocol@0.7.0
  - fuzd-common@0.7.0

## 0.6.0

### Minor Changes

- release

### Patch Changes

- Updated dependencies
  - fuzd-common@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies
  - fuzd-common@0.5.0

## 0.5.0

### Minor Changes

- new fuzd

### Patch Changes

- Updated dependencies
  - fuzd-common@0.4.0

## 0.4.0

### Minor Changes

- wip: simplified scheduler api

### Patch Changes

- Updated dependencies
  - fuzd-common@0.3.0

## 0.3.0

### Minor Changes

- use hono server + sqlite

### Patch Changes

- Updated dependencies
  - fuzd-common@0.2.0

## 0.2.4

### Patch Changes

- tweaks and better handling of low fees for executor

## 0.2.3

### Patch Changes

- use expiry in executor + save timedout in archive + save lastError

## 0.2.2

### Patch Changes

- latest deps (including tlock-js)

## 0.2.1

### Patch Changes

- export DecryptedPayload + fix

## 0.2.0

### Minor Changes

- batch of tx in scheduler

## 0.1.9

### Patch Changes

- fixes

## 0.1.8

### Patch Changes

- latest deps + remove isomorphic-unfetch

## 0.1.7

### Patch Changes

- log error when currentTimestamp is zero

## 0.1.6

### Patch Changes

- catch error when processing execution

## 0.1.5

### Patch Changes

- rework the system to allow slot and fetching list per account

## 0.1.4

### Patch Changes

- remove timeContract tracking

## 0.1.3

### Patch Changes

- update latest deps

## 0.1.2

### Patch Changes

- remove unecessary deps

## 0.1.1

### Patch Changes

- first release

---
'@fuzd/scheduler': minor
'@fuzd/server': minor
---

`scheduleExecution` refuses a schedule into a slot that has already been broadcast: it throws `cannot proceed. the slot (chainId: ..., account: ..., slot: ...) has already been used: ...`, and `@fuzd/server`'s `/api/scheduling/scheduleExecution` answers HTTP 500 with `{success: false, errors: [{message}]}`. A slot is spent once its queued record is marked broadcasted or the executor holds a record for any of its batch indices (so a partially broadcast batch spends it too). Before, the schedule answered `success: true` and was never sent: the executor found the earlier batch's records and returned them with `slotAlreadyUsed` without sending, and only the indices beyond the earlier batch's length were broadcast. A slot that is only queued is still replaced by a new schedule, and a slot whose schedule was archived before anything was broadcast is free again. Schedule into a new slot instead. A schedule into a slot that a processing run holds right now is refused too (`cannot proceed. the slot (...) is being processed: its execution may be broadcasting right now. try again in a moment.`): until the executor has stored what it sends, such a slot looks free, and a schedule accepted then would never be sent.

Storage interface: `SchedulerStorage.queueExecution(execution, {now})` stores a new schedule in one atomic upsert, unless the slot's queued execution is broadcast or held by a run; `RemoteSQLSchedulerStorage` implements it, and `scheduleExecution` writes with it.

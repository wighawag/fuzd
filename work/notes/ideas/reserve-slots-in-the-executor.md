---
title: Reserve a slot in the executor, so a schedule and a direct broadcast can never both take it
slug: reserve-slots-in-the-executor
---

## Idea

A slot (`chainId`, `account`, `slot`) can be taken by a schedule (`scheduleExecution`) or by a direct broadcast (`/api/execution/broadcastExecution`). Today both check the slot and then act, seconds apart: the executor stores its record only after its RPC requests and the broadcaster lock. So a schedule accepted while a direct broadcast into its slot is in flight is told `success: true` and is never sent. It is caught when it runs and archived with the reason (`work/tasks/done/reject-a-schedule-into-a-spent-slot.md`, "Two more gaps, closed after the port"), but the success cannot be taken back.

The executor is the natural shared place: it is what makes a slot "used", and the scheduler already depends on it. Sketch:

- `ExecutorStorage.reserveSlot({chainId, account, slot, owner: 'schedule' | 'direct', transaction})`: one atomic insert-or-check (a `SlotReservations` table, created by `/admin/setup`). A direct reservation expires, so a crashed broadcast frees the slot.
- A direct broadcast reserves first: refused if a schedule holds the slot (unless it is the same transaction, the "send it now" case) or if the slot is used.
- `scheduleExecution` reserves as `schedule` first: refused if the slot is used or reserved by a direct broadcast; replacing its own queued schedule is allowed.
- Storing the slot's first executor record marks the reservation used, in the same batch. Archiving a schedule never broadcast releases it.

## Why not now

Decided 2026-11-18: not worth it yet. It only matters when one account mixes a schedule and a direct broadcast of a different transaction on one slot within seconds, which a game's reveal flow does not do, and the loss is already visible (archived with a reason), not silent. The cost: a new table, three executor-storage methods, release-on-archive coordination, stale-reservation cleanup, and one more write per schedule and per direct broadcast. It would not close the millisecond window of a schedule written as a run that broadcast part of the slot writes it back: the scheduler's write and the executor's reservation are in two storages, which no interface makes atomic together.

Worth revisiting if a client offers both scheduling and direct broadcast on the same slots.

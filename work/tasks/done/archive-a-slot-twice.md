---
title: Archiving a slot that was archived before replaces its archive record
slug: archive-a-slot-twice
blockedBy: [reject-a-schedule-into-a-spent-slot]
covers: []
---

Built directly on request, from the observation the review of `reject-a-schedule-into-a-spent-slot` recorded on its branch ("archiving the same slot a second time conflicts on ArchivedScheduledExecutions' primary key", never merged). Reproduced: it was real.

## What was built

- `RemoteSQLSchedulerStorage.archiveExecution` and `archiveClaimedExecution` write the archive with `INSERT OR REPLACE`: the archive keeps one record per slot (its primary key `(account, chainId, slot)`), the latest.
- Tests: `packages/server/test/spent-slot.test.ts` ("a slot archived twice": schedule, archive, schedule, archive through the admin route, then the archive holds the second schedule and a third is accepted; red before: the second archive answered an error) and `claimed-writes.test.ts` (a claimed archive of a slot archived before; red before: `UNIQUE constraint failed`).

## Acceptance criteria

- [x] A slot can be archived any number of times; the verify gate passes; changeset (`@fuzd/server`: patch).

## Decisions

- **Replace, not keep every archive**: keeping all of them needs another primary key for `ArchivedScheduledExecutions` (a schema migration, by hand on existing databases). The archive is read per account (`getAccountArchivedSubmissions`), where the latest record of a slot is the one that says what happened to it. Earlier archives of a slot are lost; say if they matter.

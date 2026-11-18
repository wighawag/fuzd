---
'@fuzd/server': patch
---

Archiving a slot that was archived before no longer fails. A slot archived without a broadcast is free to be scheduled into again, and when that schedule was archived too (the admin route, an expiry, a failed prior transaction, 100 failed retries), the insert into `ArchivedScheduledExecutions` hit its primary key (one record per slot): the archive failed and the execution stayed queued, failing again at every run. The archive now keeps the latest record of the slot.

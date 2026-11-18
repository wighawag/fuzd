---
title: The read-only admin routes and the admin dashboard pages have no authentication
slug: admin-read-routes-and-dashboard-are-public
---

Spotted while protecting `/internal/*` (not changed there, out of scope). In `packages/server/src/api/admin/index.ts`, `GET /admin/queue`, `/admin/account-submissions/:account`, `/admin/executions`, `/admin/all-executions` and `/admin/test/:message` are declared before the `basicAuth` group, under a `// TODO authentication` comment. Likewise in `packages/server/src/dashboard/admin/index.tsx` the pages before its `basicAuth` group (`/dashboard/admin/queue`, `queue-with-payload`, `all-submissions`, `account-submissions/:account`, `account-archived-submissions/:account`, `executions`, ...) are public.

They are read-only, but they list every queued execution with its payload (time-locked payloads stay encrypted, clear ones do not), broadcasters and errors, and each request costs database reads on a metered platform. Worth a decision: move them behind the admin auth, or keep some public on purpose and say which.

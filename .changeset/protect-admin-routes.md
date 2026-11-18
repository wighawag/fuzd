---
'@fuzd/server': minor
---

Every `/admin/*` route and every `/dashboard/admin/*` page now requires HTTP Basic auth (user `admin`, password `TOKEN_ADMIN`). The read-only ones (`/admin/queue`, `/admin/account-submissions/:account`, `/admin/executions`, `/admin/all-executions`, `/admin/test/:message`, and the dashboard pages, including `queue-with-payload`) were open to anyone. A browser opening the dashboard shows its login dialog and remembers the credentials. Without `TOKEN_ADMIN` all of them are refused. The dashboard now reads `TOKEN_ADMIN` through `getEnv` like the rest of the server, so on node (the `fuzd` CLI) its pages accept the admin token too (they compared with `c.env`, which is not the env there).

`GET /admin/paymentAccountBroadcaster` returns `{address}` only, instead of the whole derived account with its private key.

---
title: Put every admin route and dashboard page behind the admin auth
slug: protect-admin-routes
blockedBy: []
covers: []
---

Built directly on request. It discharges the observations `admin-read-routes-and-dashboard-are-public.md` and `admin-payment-account-broadcaster-returns-private-key.md` (both deleted).

Before: the admin API declared its read routes (`/admin/queue`, `/admin/account-submissions/:account`, `/admin/executions`, `/admin/all-executions`, `/admin/test/:message`) before its `basicAuth` group, so they were public, and every dashboard page was public (its `basicAuth` group had no route at all), including `queue-with-payload`, which shows the payloads of executions in clear. The dashboard's check read `c.env.TOKEN_ADMIN`, which on node (the `fuzd` CLI, where `c.env` is not the env) does not hold the token.

## What was built

- `@fuzd/server`: `adminAuth(options)` (`src/admin-auth.ts`), one Basic auth middleware (user `admin`, password `TOKEN_ADMIN` read through `getEnv`, everything refused when it is unset), used by the admin API, the admin dashboard and the admin fallback of `/internal/*`. Both admin apps apply it before any route and before `setup`, so an anonymous request costs no key derivation and no database read.
- `GET /admin/paymentAccountBroadcaster` returns `{address}`.
- Test `packages/server/test/admin-auth.test.ts`: reads the routes from `app.routes` (every `/admin/*` and `/dashboard/*` route, middlewares excluded) and checks anonymous, wrong password and wrong user get 401 with a Basic challenge, the admin gets 200 on every GET (except `setChainOverride`, refused without `DEV`) and no 401 on the POSTs, and a server without `TOKEN_ADMIN` refuses everything, including an empty password and the string `undefined`. A sample value per path parameter is in the test: a new route with a new parameter name fails the test until one is added. Red before the fix: anonymous 200 on `/admin/queue`, and the private key in the payment response.

## Acceptance criteria

- [x] Anonymous requests get 401 on every admin route and dashboard page; the list comes from the app.
- [x] Admin credentials get 200; a wrong password gets 401; no `TOKEN_ADMIN` refuses all.
- [x] The dashboard and the admin API read `TOKEN_ADMIN` the same way (`getEnv`).
- [x] `/admin/paymentAccountBroadcaster` no longer returns a private key.
- [x] Changeset for `@fuzd/server` (minor).

## Decisions

- **No route stays public.** They are read-only, but they list every queued execution with broadcasters and errors (and clear payloads), and each request costs database reads on a metered platform. Nothing in the repo calls them anonymously: the client, the CLI, the load test and the end-to-end tests do not use them.
- **Basic auth, not a token in the dashboard UI**: the browser's native dialog remembers the credentials, so the dashboard pages and their links keep working unchanged.
- **The payment account broadcaster: address only.** No caller of the route exists in the repo (searched the packages, platforms, tests and docs; the only mention is a commented line in `tests/starknet/index.test.ts`). The operator needs the address to fund it; whoever needs the key can derive it from the mnemonic they already hold.

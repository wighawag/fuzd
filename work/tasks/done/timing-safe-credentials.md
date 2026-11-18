---
title: Compare the admin password and the internal token in constant time
slug: timing-safe-credentials
blockedBy: []
covers: []
---

Built directly on request, found in review. `packages/server/src/admin-auth.ts` compared the admin password with `===`, and `packages/server/src/api/internal/index.ts` the internal token: `===` stops at the first differing character, so the response time tells how much of a guess is right.

## What was built

- `safeEqual(a, b)` (`packages/server/src/utils/safe-equal.ts`): SHA-256 of both sides with `crypto.subtle` (Workers and node), then the 32-byte digests compared with an XOR accumulator, without stopping early. Hashing first also hides a difference in length.
- The admin auth compares both the user name and the password with it (`verifyUser` is async, which hono's `basicAuth` accepts), and the internal routes the token.
- Test `packages/server/test/safe-equal.test.ts` (equal, different, longer, empty, Unicode normalisation not applied, both sides hashed with SHA-256). Red first only as a missing module: the helper is new. `admin-auth.test.ts` and the internal-token tests of `queue-processing.test.ts` pass unchanged.

## Acceptance criteria

- [x] Constant-time comparison of the admin password and the internal token, on Workers and on node.
- [x] The helper is tested; `admin-auth.test.ts` passes.
- [x] Changeset (`@fuzd/server`: patch).

## Decisions

- **Our own helper rather than hono's `timingSafeEqual`**: that one hashes both sides too, but then compares the hex digests with `===` and the inputs with `===` as well; a byte loop over the digests is the intent stated here, and it is ten lines.
- **The user name is compared in constant time too, and both comparisons always run**, so the timing does not tell which of the two was wrong.

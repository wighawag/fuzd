---
'@fuzd/server': patch
---

The admin credentials (HTTP Basic, user `admin`, password `TOKEN_ADMIN`) and the internal token of the `/internal/*` routes are compared in constant time. They were compared with `===`, which stops at the first differing character, so the response time told how much of a guess was right. Both sides are now hashed with SHA-256 (`crypto.subtle`, on Workers and on node) and the digests compared byte by byte, which also hides a difference in length.

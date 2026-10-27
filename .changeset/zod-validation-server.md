---
'fuzd-server': minor
---

Validate every route with zod 4 schemas (pinned to the canonical types with zod-schema-for) instead of typia.

- Addresses and every other `0x` value are accepted in any case and normalised to lowercase, in path parameters, bodies and the signer recovered from the `signature` header. Responses now return them lowercase (e.g. `account`, `onBehalf`, `paymentReserve.broadcaster`), where `account` used to be checksummed.
- `scheduling/scheduledExecution(s)/:account` now find executions submitted with a signature (they lowercased the parameter while the record was stored checksummed), and `execution/execution/:account/...` now accepts either form.
- Invalid input (non-hex `0x` values, non-integer `chainId` or `batchIndex`) is answered with a 400 and the usual `{success: false, errors}` body. Unknown body keys are dropped instead of being stored.
- Run `/admin/setup` once after upgrading: it lowercases the addresses of rows stored by previous versions.
- The OpenAPI document is generated from the same schemas (hono-openapi) and served at `/doc/openapi.json`; `hono` is now `^4.11.2`.

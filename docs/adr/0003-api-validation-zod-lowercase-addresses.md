---
status: accepted
---

# API validation with Zod 4 + `zod-schema-for`; every `0x` value normalised to lowercase at the server boundary

`fuzd-server` validates every request (path parameters and JSON bodies) with Zod 4 schemas that live only in `fuzd-server`, each pinned to the hand-written TypeScript types with `schemaFor<In, Out>()` from `zod-schema-for` (exact type identity, transform-aware). The types in `fuzd-common`, `fuzd-scheduler`, `fuzd-chain-protocol` stay the canonical representation; a schema conforms to its type, never the reverse. Every `String0x` (addresses, hashes, calldata, Starknet felts) is accepted in any case and normalised to **lowercase** once, by the shared `String0x` schema and by the `auth` middleware for the signer address, so a caller no longer has to know which form a route wants.

## Context

Before this, typia validated bodies but could not transform, so each route chose its own address case by hand and they disagreed. Measured on `main` @ `ec0641a`:

- `auth` recovers the signer with viem's `recoverAddress`, which returns the EIP-55 checksummed form; scheduler and executor stored that `account` verbatim, so DB keys were checksummed.
- Derived broadcaster addresses (`remote-account`) are lowercase; `onBehalf` and `paymentReserve.broadcaster` were stored in whatever case the caller sent.
- `scheduling/scheduledExecution(s)/:account` lowercased the param, so they never matched a signed submission; `execution/execution/:account` matched only the exact checksummed form; `reserved/:broadcaster` matched only because `fuzd-client` happens to send the lowercase derived address.
- typia ignored the `Pattern` tag on the `` `0x${string}` `` template literal (typia#1346): `String0x` was only checked against `/^0x(.*)/`.

## Decision details

- **Lowercase, not checksummed**: it is what the `String0x` type always declared (`^0x[a-f0-9]+$`), derived broadcasters are already lowercase, `String0x` also covers non-address hex and Starknet where EIP-55 does not apply, and it needs no per-field knowledge of "is this an address".
- **Responses change**: `account`, `onBehalf`, `paymentReserve.broadcaster` come back lowercase. Existing rows are migrated by idempotent `UPDATE ... SET x = lower(x)` statements in the storage setup SQL (run via `/admin/setup` or `?_initDB=true`). No key collision is possible: every stored `account` came from `auth`, i.e. one consistent (checksummed) form.
- **Boundary only**: `fuzd-scheduler` / `fuzd-executor` used directly as libraries still trust their caller's case; the server is the one place that normalises.
- **Strictness**: same acceptance as typia, except `String0x` must now really be hex (`^0x[0-9a-fA-F]*$`, no length check). Unknown keys are stripped (Zod default) instead of being passed through to storage. Invalid input is a 400.
- **Intersection types**: `schemaFor` treats `A & B` as distinct from the equivalent flat object (a false alarm, see `zod-schema-for` docs/edge-cases.md), so the server pins against a local distributive `Flat<T>` of the canonical type instead of editing the public types.
- **OpenAPI**: generated from the same Zod schemas with `hono-openapi` (`describeRoute` + its validator, `generateSpecs` at build), request and response, replacing `hono-typia-openapi`. This required hono `^4.11`.

## Considered Options

- **Keep typia, normalise addresses in a middleware**: rejected; typia cannot transform, so the middleware would need its own schema-less list of which fields are addresses, and typia did not even enforce `String0x`.
- **Schemas co-located in the public packages** (the abandoned `feat/use-zod` branch): rejected for now; it makes zod a runtime dependency of every `fuzd-client` consumer. Can move later if the client needs to validate.
- **Hand-written OpenAPI with a check**: rejected (drift). **`@hono/zod-openapi`**: rejected; it would rewrite every route around `OpenAPIHono`/`createRoute` and change how the exported `Client` type is built.
- **Rebuilding on `feat/use-zod`**: rejected; its primitives were wrong (lowercase-only regex before lowercasing, unanchored integer regex, `z.number()` on a string path param) and it targeted zod 3.25's `zod/v4` subpath.

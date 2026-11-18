---
title: The client's errors carry the server's messages
slug: client-failure-messages
blockedBy: [reject-a-schedule-into-a-spent-slot]
covers: []
---

Built directly on request, from the observation the `reject-a-schedule-into-a-spent-slot` branch recorded ("@fuzd/client still reads a failure as `error` (or throws the `errors` array) in two internal calls", never merged).

## What was built

- `packages/client/src/index.ts`: `failureMessage` joins the `errors[].message` of a server failure (`FailureResponse`), with the URL as the fallback; `_fetchRemoteAccount` (behind `assignRemoteAccount`, `scheduleExecution`, `broadcastExecution`) and `computeBalanceRequired` throw with it.
- Tests in `packages/client/test/schedule.test.ts`: a remote account on a chain the server does not support throws `cannot get protocol for chain with id 99999` (red before: `failed: <url>`), and a reserved amount for an invalid chain id throws a message naming `chainId` (red before: `[object Object]`).

## Acceptance criteria

- [x] Both calls throw the server's message; the verify gate passes; changeset (`@fuzd/client`: patch).

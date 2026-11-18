---
title: Decrypt a twice time-locked ("onion") execution down to its inner transaction
slug: onion-decryption
blockedBy: []
covers: []
---

Built directly on request. It discharges the observation `onion-decryption-new-payload-is-dropped.md` (deleted).

Before: when the decrypted payload of a time-locked execution was itself `time-locked`, `@fuzd/tlock-decrypter` threw for every supported inner timing (an inverted check), and even past that, `execute` in `@fuzd/scheduler` only used the returned `retry` as the next check-in: it never stored `newPayload` or `newTiming`, so every attempt decrypted the outer layer again. The execution was then archived as too late by the outer timing's expiry.

## What was built

- `@fuzd/tlock-decrypter`: the onion branch checks the inner timing (not the outer), refuses only a timing that cannot be time-locked, and computes the round of a `delta-time-with-target-time` inner timing with `roundAt` (it used the target time as a round number).
- `@fuzd/scheduler`: on an onion result, `peelOuterLayer` replaces the payload and timing by the inner ones, drops the outer timing's `priorTransactionConfirmation`, and the check-in time becomes the inner timing's time (or the decrypter's retry round time, if later). The row is stored and the run reports `reassigned`.
- `@fuzd/server`: `ServerOptions.getDrandClient` (drand mainnet by default), so a test can decrypt offline.
- Test `packages/server/test/onion-decryption.test.ts`: an in-process server with `TIME_LOCK_DECRYPTION=true`, an offline fake drand (`test/utils/fake-drand.ts`, built like the client tests' one, but refusing a round whose time has not come) and a faked `Date`. A two-layer payload is scheduled; after the first round the row holds the inner payload and timing; past the outer expiry it is still queued; after the second round exactly one transaction is sent, and the executor's expiry is the inner time plus the inner (or inherited) `expiryDelta`. Red before the fix: first `execution timing of type "fixed-time" is not supported` as `lastError`, then (decrypter fixed) the outer payload still stored after the first round. The decrypter is also tested on its own: a `delta-time-with-target-time` inner timing waits for the round of its target time, and a `delta-time` inner timing is refused.

## Acceptance criteria

- [x] A two-layer payload is broadcast once, after both rounds have passed, without network access.
- [x] The expiry of an onion execution is computed from the inner timing.
- [x] The test runs in the verify gate (`packages/server` tests).
- [x] Changeset for `@fuzd/scheduler`, `@fuzd/tlock-decrypter`, `@fuzd/server` (minor).

## Decisions

- **The expiry counts from the inner timing**, once the outer layer is peeled: that is the time the user's transaction is actually meant for, and the outer timing (often just "not before") would otherwise archive it as too late before the inner time comes. **An inner layer without `expiryDelta` (or with 0, which the expiry reads as unset; found in review) keeps the outer one** rather than falling back to the server's 24h maximum: peeling a layer never makes the execution live longer than the user asked. Before the first layer is decrypted, the outer timing decides, as for any time-locked execution (the server cannot see the inner one).
- **A peeled layer waits for the next run** even when its time has already passed (both rounds passed before the first processing): it is due at once, but a run does not handle an execution twice. Simple, and bounded by the time between runs.
- **The prior transaction confirmation is dropped** when the timing changes: it was checked against the outer timing's transaction, which the inner timing may not share.

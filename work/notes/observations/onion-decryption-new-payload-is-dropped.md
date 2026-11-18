---
title: The scheduler drops the newPayload and newTiming of an onion (twice time-locked) decryption
slug: onion-decryption-new-payload-is-dropped
---

Spotted while reworking the failure paths of `execute` in `packages/scheduler/src/scheduler.ts` (not verified by a test). When the decrypted payload is itself `time-locked`, `@fuzd/tlock-decrypter` returns `{success: false, newPayload, newTiming, retry}`. The scheduler only uses `retry` (as the next checkin time) and never stores `newPayload` or `newTiming`, so at the next checkin it would decrypt the outer layer again, get the same answer, and never reach the inner payload. Also, the decrypter's own type check there looks inverted (`if (!(fixed-time || fixed-round || delta-time-with-target-time)) {} else { throw }` throws for exactly the supported timings). Worth a test of a two-layer payload before relying on it.

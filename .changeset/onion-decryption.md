---
'@fuzd/scheduler': minor
'@fuzd/tlock-decrypter': minor
'@fuzd/server': minor
---

A twice time-locked ("onion") execution now reaches its inner transaction. When the decrypted payload is itself `time-locked`, the scheduler stores that inner payload and its timing and waits for the inner time; before, it kept the outer layer, decrypted it again at every check-in and never broadcast. From then on the inner timing decides the check-in time and the expiry (counted from the inner time, with the inner `expiryDelta`, or the outer one when the inner layer has none).

`@fuzd/tlock-decrypter` accepted no inner timing at all (its check was inverted: it threw for exactly the supported `fixed-time`, `fixed-round` and `delta-time-with-target-time`), and for `delta-time-with-target-time` it took the target time for a drand round. It now refuses only an inner timing that cannot be time-locked.

`@fuzd/server`: `ServerOptions.getDrandClient` sets the drand network time-locked executions are decrypted with (drand mainnet when not given).

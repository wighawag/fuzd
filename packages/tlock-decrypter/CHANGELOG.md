# @fuzd/tlock-decrypter

## 0.12.0

### Minor Changes

- d63f9c0: A twice time-locked ("onion") execution now reaches its inner transaction. When the decrypted payload is itself `time-locked`, the scheduler stores that inner payload and its timing and waits for the inner time; before, it kept the outer layer, decrypted it again at every check-in and never broadcast. From then on the inner timing decides the check-in time and the expiry (counted from the inner time, with the inner `expiryDelta`, or the outer one when the inner layer has none).

  `@fuzd/tlock-decrypter` accepted no inner timing at all (its check was inverted: it threw for exactly the supported `fixed-time`, `fixed-round` and `delta-time-with-target-time`), and for `delta-time-with-target-time` it took the target time for a drand round. It now refuses only an inner timing that cannot be time-locked.

  `@fuzd/server`: `ServerOptions.getDrandClient` sets the drand network time-locked executions are decrypted with (drand mainnet when not given).

### Patch Changes

- Updated dependencies [634d9b2]
- Updated dependencies [ef023b9]
- Updated dependencies [ce469f4]
- Updated dependencies [78c897b]
- Updated dependencies [d63f9c0]
- Updated dependencies [a86ddf2]
- Updated dependencies [52e27a9]
- Updated dependencies [7175a77]
  - @fuzd/common@0.12.0
  - @fuzd/scheduler@0.12.0

## 0.11.1

### Package name

- Published as `@fuzd/tlock-decrypter`, previously `fuzd-tlock-decrypter`. Same code; `fuzd-tlock-decrypter` stops at its last version and is deprecated.

### Patch Changes

- Updated dependencies [fdeaaab]
  - fuzd-common@0.11.1
  - fuzd-scheduler@0.11.1

## 0.11.0

### Minor Changes

- update

### Patch Changes

- Updated dependencies
  - fuzd-common@0.11.0
  - fuzd-scheduler@0.11.0

## 0.10.0

### Minor Changes

- release

### Patch Changes

- Updated dependencies
  - fuzd-common@0.10.0
  - fuzd-scheduler@0.10.0

## 0.9.7

### Patch Changes

- fixes + allow more timing options
- Updated dependencies
  - fuzd-scheduler@0.9.7

## 0.9.6

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.9.6

## 0.9.5

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.9.5
  - fuzd-common@0.9.4

## 0.9.4

### Patch Changes

- fuzd-scheduler@0.9.4

## 0.9.3

### Patch Changes

- fuzd-scheduler@0.9.3

## 0.9.2

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.9.1

## 0.9.0

### Minor Changes

- some changes

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.9.0

## 0.8.0

### Minor Changes

- refactor

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.8.0

## 0.7.4

### Patch Changes

- fuzd-scheduler@0.7.4

## 0.7.3

### Patch Changes

- fuzd-scheduler@0.7.3

## 0.7.2

### Patch Changes

- cli for nodejs + autoSetupDB
- Updated dependencies
  - fuzd-scheduler@0.7.2

## 0.7.1

### Patch Changes

- tlock-js from drand
- Updated dependencies
  - fuzd-scheduler@0.7.1

## 0.7.0

### Minor Changes

- major refactor

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.7.0

## 0.6.0

### Minor Changes

- release

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.6.0

## 0.5.1

### Patch Changes

- fuzd-scheduler@0.5.1

## 0.5.0

### Minor Changes

- new fuzd

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.5.0

## 0.4.0

### Minor Changes

- wip: simplified scheduler api

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.4.0

## 0.3.0

### Minor Changes

- use hono server + sqlite

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.3.0

## 0.2.4

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.2.3

## 0.2.2

### Patch Changes

- latest deps (including tlock-js)
- Updated dependencies
  - fuzd-scheduler@0.2.2

## 0.2.1

### Patch Changes

- export DecryptedPayload + fix
- Updated dependencies
  - fuzd-scheduler@0.2.1

## 0.2.0

### Minor Changes

- batch of tx in scheduler

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.2.0

## 0.1.9

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.1.9

## 0.1.8

### Patch Changes

- latest deps + remove isomorphic-unfetch
- Updated dependencies
  - fuzd-scheduler@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.1.5

## 0.1.4

### Patch Changes

- remove timeContract tracking
- Updated dependencies
  - fuzd-scheduler@0.1.4

## 0.1.3

### Patch Changes

- update latest deps
- Updated dependencies
  - fuzd-scheduler@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  - fuzd-scheduler@0.1.2

## 0.1.1

### Patch Changes

- first release
- Updated dependencies
  - fuzd-scheduler@0.1.1

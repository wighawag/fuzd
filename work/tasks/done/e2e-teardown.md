---
title: The end-to-end suite ends without vitest waiting on leftover processes
slug: e2e-teardown
blockedBy: []
covers: []
---

Built directly on request. Every end-to-end run ended with "close timed out after 10000ms ... something prevents Vite server from exiting": 10 seconds lost, and processes left for vitest to kill. The hanging-process reporter showed execa children (prool-any's `pnpm fuzd`, and anvil).

## What was built

- `tests/end-to-end/test/prool/setup.ts`: `resetNodes` awaits each instance's restart (the map callback returned nothing, so `Promise.all` awaited nothing). The last test file's restart was still starting processes when the global teardown stopped the pools, which already looked empty to it.

## Acceptance criteria

- [x] The suite ends without the message, in about 8s instead of 12s, three runs in a row, with no anvil or fuzd process left.

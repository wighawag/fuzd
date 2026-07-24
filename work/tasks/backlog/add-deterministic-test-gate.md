---
title: Add a deterministic test gate runnable in verify
slug: add-deterministic-test-gate
blockedBy: []
covers: []
---

## What to build

The repo has tests only under `tests/*` (`fuzd-tests-end-to-end`, `fuzd-tests` (ethereum), `tests-starknet`), each a `vitest` run that requires external infra (hardhat node, cloudflare `wrangler`/`prool`, a starknet devnet). Because of that, the `dorfl.json` `verify` gate currently covers only `pnpm -r format:check && pnpm -r build` and excludes tests.

Add a deterministic, self-contained test layer that can run with no external services, so `verify` can include a real test step. Concretely:

- Add unit/integration tests for the pure-logic seams of the core packages (`fuzd-common`, `fuzd-scheduler`, `fuzd-executor`, `fuzd-chain-protocol`, `fuzd-tlock-decrypter`) that do not need a live chain or Drand network (mock/stub the chain-protocol and decryption boundaries).
- Wire a `test` script into those packages (mirroring the existing `vitest` usage) so `pnpm -r test` runs green offline.
- Once green offline, extend the `verify` gate in `dorfl.json` to `pnpm -r format:check && pnpm -r build && pnpm -r test` (or a scoped filter that excludes the infra-dependent `tests/*` suites).

The existing infra-dependent `tests/*` suites stay as they are (out of the default gate); this task is about a fast deterministic layer.

## Acceptance criteria

- [ ] New offline tests run green via a single command with no external services running.
- [ ] Tests cover meaningful behaviour of at least the core logic seams (not placeholder assertions), mirroring the repo's existing vitest style.
- [ ] The `verify` gate in `dorfl.json` is updated to include the deterministic test step and passes end to end.
- [ ] No test writes to a shared/global location; any fixture I/O is isolated to a temp/scratch dir.
- [ ] A changeset is added if any published package's behaviour/config changes.

## Blocked by

- None — can start immediately.

## Prompt

> Goal: give fuzd a fast, deterministic test layer so the `verify` acceptance gate can actually run tests, not just build+format. Today `verify` is `pnpm -r format:check && pnpm -r build`; tests were excluded because the only suites (`tests/end-to-end`, `tests/ethereum`, `tests/starknet`) require external infra (hardhat, wrangler/prool, starknet devnet) and are not tree-green deterministic.
>
> Vocabulary and layout are in `CONTEXT.md`: the core packages are `fuzd-common`, `fuzd-scheduler`, `fuzd-executor`, `fuzd-chain-protocol` (EVM + Starknet abstraction), `fuzd-tlock-decrypter` (Drand timelock), `fuzd-server`, `fuzd-client`. Test at the pure-logic seams: mock the chain-protocol boundary and the decryption boundary so no live chain or Drand network is needed. Use `vitest` to match the repo. Add a `test` script to each package you add tests to so `pnpm -r test` picks them up.
>
> Done means: `pnpm -r test` (or a filtered equivalent) is green offline with meaningful assertions, and `dorfl.json` `verify` is updated to include it and still passes. Add a changeset for any published-package change.
>
> RECORD non-obvious in-scope decisions (e.g. where you draw the mock boundary for chain-protocol/decryption) in the done record; if a choice is ADR-worthy per `work/protocol/ADR-FORMAT.md`, write the ADR in `docs/adr/`.

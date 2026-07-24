---
title: Fix pre-existing prettier violation in chain-protocol ERC20 abi
slug: format-erc20-abi-file
blockedBy: []
covers: []
---

## What to build

The `verify` gate (`pnpm -r format:check`) fails on a pre-existing formatting violation: `packages/chain-protocol/src/starknet/abis/ERC20.ts` is not prettier-clean. Run the package's `format:write` (prettier) on that file so `pnpm -r format:check` passes, without changing any logic.

This was surfaced during `setup` onboarding; it is unrelated to any feature work and blocks a green gate.

## Acceptance criteria

- [ ] `pnpm -r format:check` passes (the ERC20.ts warning is gone).
- [ ] Only formatting changed; no behavioural/logic change to the abi.
- [ ] A changeset is added only if a published package's output changes (a pure reformat of a source file usually needs none — use judgement).

## Blocked by

- None — can start immediately.

## Prompt

> Goal: make the `verify` gate green by fixing one pre-existing prettier violation. Run prettier `--write` on `packages/chain-protocol/src/starknet/abis/ERC20.ts` (the package has a `format:write` script). Change nothing but formatting. Verify with `pnpm -r format:check`. This is a trivial chore surfaced during `setup`; do not touch anything else.

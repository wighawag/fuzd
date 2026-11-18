---
title: Pin pnpm, so allowBuilds is always honoured
slug: pin-pnpm
blockedBy: [cf-worker-smoke-test-and-types]
covers: []
---

Built directly on request, from the "found but not fixed" list: `pnpm-workspace.yaml`'s `allowBuilds` (which denies the install scripts of esbuild, sharp and workerd) exists since pnpm 10.26, and nothing pinned pnpm: the docs workflow (`.github/workflows/deploy.yml`) installed with pnpm 9, which ignores it and runs every install script.

## What was built

- `"packageManager": "pnpm@11.25.0"` in the root `package.json`, the version the release workflow already used.
- Both workflows take pnpm from that field (`pnpm/action-setup@v5` without `version`); the docs workflow moves from pnpm 9 and node 20 to it and node 24, as the release workflow.

## Acceptance criteria

- [x] One pnpm version for local installs and both workflows.
- [ ] The docs workflow still deploys: not run here (it runs on GitHub), to check on its next run.

## Decisions

- **Pinned rather than an `engines` range**: the release workflow already pinned 11.25.0, and pnpm itself checks the `packageManager` field when another version runs in the repo.

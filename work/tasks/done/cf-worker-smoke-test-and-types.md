---
title: A cf-worker smoke test that runs in the Workers runtime, and no type errors in platforms/cf-worker
slug: cf-worker-smoke-test-and-types
blockedBy: []
covers: []
---

Built directly on request. `platforms/cf-worker/test/basic.test.ts` (workers pool) did not start at all: `@cloudflare/vitest-pool-workers` 0.5.36 failed to load starknet-core's CommonJS requires in workerd (and, with that bundled, vitest's own spy module). Its expectations were stale too (`/` answers `fuzd api : <version>`; the second test needed a chain RPC and checked a field the API no longer returns). `npx tsc --noEmit -p tsconfig.json` failed: hono's `ExecutionContext` requires `props`, which `@cloudflare/workers-types` 4.20241205 lacks, and the tests were type-checked without the `cloudflare:test` types.

## What was built

- `@cloudflare/vitest-pool-workers` ^0.12.21 (the last line that accepts vitest 2.1; 0.13 and later need vitest 4) and `@cloudflare/workers-types` ^4.20260702.1 (the last 4.x; it has `props`). The package's own `wrangler` (deploys) stays 3.95; a `wrangler deploy --dry-run -e staging` still bundles.
- `vitest.config.ts`: only `test/**/*.test.ts` minus `*.node.test.ts` (those are `pnpm test:node`); `@fuzd/server` pre-bundled by Vite (served module by module, its generated `schema/ts/*.sql.js` match wrangler's default `**/*.sql` Text rule in the pool, and workerd fails to load them); that bundle removed before each run, since Vite only checks the lockfile before reusing it and `@fuzd/server` is a workspace package; the test's own `HD_MNEMONIC` and `TOKEN_ADMIN` bindings, over any `.dev.vars`.
- `test/basic.test.ts` is a smoke test: `/` answers its version, `/admin/setup` refuses without credentials and sets D1 up with them, `/internal/*` refuses without credentials, and the `*/2` cron (`checkScheduledExecutionStatus`) runs to a success. No chain needed.
- `src/worker.ts`: the scheduled handler is typed with `ScheduledController` (what a module Worker gets; `ScheduledEvent` is the service-worker syntax, and the test's `createScheduledController` did not fit it). `tsconfig.json` includes `src` only; `test/tsconfig.json` checks the tests with the pool's types. Both `tsc --noEmit` pass.
- `pnpm test` is `vitest run` (it was `vitest`, watch mode on a terminal).
- `pnpm-workspace.yaml`: `allowBuilds` false for esbuild, sharp and workerd, which the upgrade brought with install scripts; pnpm 11 otherwise fails every `pnpm` command on the undecided builds.

## Acceptance criteria

- [x] The workers-pool test runs and passes (`cd platforms/cf-worker && pnpm test`: 4 tests, about 1.5s wall time including workerd start).
- [x] `npx tsc --noEmit -p tsconfig.json` and `-p test/tsconfig.json` pass, without `as any`.
- [x] `pnpm test:node` still passes.

## Decisions

- **It can join the verify gate**: it takes about 1.5 s and needs no network or chain, but it must run after `pnpm -r build` (it bundles `@fuzd/server` from `dist`), and it needs the workerd binary of the platform (an optional dependency of `workerd`). The gate itself (`dorfl.json`) was not changed: that is the maintainer's call.
- **Install scripts denied, not allowed**: esbuild and workerd get their binaries from optional dependencies and the tests pass without the scripts; sharp is miniflare's, for an images binding fuzd does not use. Allowing them would run code at install for nothing.
- **The pool reads `.dev.vars`** (a developer's local secrets, git-ignored) whatever the config says; the test sets the secrets it needs over it and avoids anything a `CHAIN_*` there could reach.

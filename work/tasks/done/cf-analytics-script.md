---
title: A script that reads per-minute invocations, CPU and wall time from the Cloudflare GraphQL analytics API
slug: cf-analytics-script
blockedBy: []
covers: []
---

Built directly on request. During the load tests of `parallel-processing`, `wrangler tail` sampled and dropped most busy invocations and their logs, and the numbers in `work/notes/findings/cloudflare-worker-cron-capacity.md` came from the GraphQL analytics API by hand.

## What was built

- `tests/load/cf-analytics.ts`: queries `durableObjectsInvocationsAdaptiveGroups` (the processing loops' alarms) and `workersInvocationsAdaptive` (the Worker, by `eventType`: `cron`, `fetch`) for one `scriptName` and a time range, and prints one line per minute and source: invocations, errors, CPU and wall p50 and p99, and the Worker's CPU sum, in seconds. `--json` prints the raw answer. The account id comes from `--account`, `CLOUDFLARE_ACCOUNT_ID`, or `wrangler whoami` (run in `platforms/cf-worker`, refused when it lists several accounts).
- `tests/load/cf-analytics.test.ts` (`node --test`, or `pnpm test` in `tests/load`): parsing, the table, errors, relative times and the `whoami` parsing, against `tests/load/fixtures/cf-analytics-sample.json`, an answer recorded from `fuzd-cf-worker-staging` (2026-11-18, 16:22 to 16:25 UTC, during a load test), without the network.
- `tests/load/README.md` documents it in place of the `wrangler tail` advice; the finding says where the per-minute numbers come from.

## Acceptance criteria

- [x] Per-minute invocation counts with CPU and wall-time quantiles, filtered by script name and time range.
- [x] Account id from an option or `wrangler whoami`.
- [x] Parsing and formatting tested offline against a recorded response.
- [x] Documented in `tests/load/README.md`.

## Decisions

- **Run against the real API once** (`CLOUDFLARE_API_TOKEN` was set): the field names and units were checked by introspection and by that recorded answer (CPU and wall times are in microseconds), rather than from the docs alone. Only analytics were read; nothing was deployed or changed.
- **`node --test`, not vitest**: `tests/load` runs its scripts with node's type stripping and has no test runner; no dependency added. Not in the verify gate (it covers `packages/*`).
- **No changeset**: `tests/load` is a private workspace package, not published.
- The test was written with the script, not before it: its content is a recorded answer, which needs the query to exist.

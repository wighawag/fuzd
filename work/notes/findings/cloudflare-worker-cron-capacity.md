---
title: What one Cloudflare Worker cron run can process for fuzd
slug: cloudflare-worker-cron-capacity
source: 'measured on the fuzd-cf-worker-staging Worker (Workers Paid, D1 fuzd-db-staging in WEUR) with tests/load/reveal-burst.ts, chain = a local anvil reached through a trycloudflare tunnel, 2026-11-18 (the processing loops: same day, later, chain id 31338, CPU and wall times from the GraphQL analytics API and wrangler tail); limits from developers.cloudflare.com/workers/platform/limits, /d1/platform/limits, /queues/platform/limits, /durable-objects/platform/limits and /durable-objects/api/alarms, fetched 2026-11-18'
---

Measured, so the processing budget (`ProcessingBudget` in `@fuzd/common`) can be sized from numbers rather than guesses. The RPC went through a tunnel, so wall times are pessimistic compared to a hosted RPC.

- **Per execution, sequentially**: about 1.5s of wall time (one processQueue run of 10, called by hand: 14.9s), dominated by RPC round trips.
- **CPU per execution**: 45 to 100 ms, mostly the drand timelock decryption. 10 executions took 650 to 970 ms CPU; 100 took 4.1 to 7.3s; 200 took 9.2 to 20s. The documented cron limit is 30s of CPU for an interval under 1 hour, so 100 per run is safe and 200 is close to the edge.
- **Database**: 9.0 statements per execution, counted in `packages/server/test/queue-processing.test.ts`. The D1 docs say 1000 queries per Worker invocation on Workers Paid, yet runs of 200 executions (about 1800 statements) logged no D1 error. Batched statements may count as one query; not confirmed.
- **Throughput with the budget of 100, 10 concurrent**: exactly 100 executions per minute; 600 drained in 6 minutes. With 200 per run (staging only): 2000 in 10.3 minutes, the wall-time budget (40s) cutting some runs at 150.
- **Submissions**: about 34 players per second sustained at 50 concurrent requests, p99 under 2.5s; 36 per second at 200 concurrent, with latency rising (p50 3.9s). Submitting is far from the limit for a 23h commit phase.
- **Cron triggers**: new triggers took about 12 minutes to start firing after the first deploy (the docs say up to 15). Runs start around second 55 of each minute.
- **Global scope**: a Worker refuses to deploy when random values are generated at global scope (`crypto.getRandomValues`, error 10021), which is where `createServer` runs.
- **Beyond about 150 to 200 per minute**, one cron per minute is not enough: the work has to be spread over several invocations, each with its own CPU budget. Done with a pool of Durable Object alarm loops and claims (`docs/adr/0004-claim-due-items-with-a-lease.md`), measured below.

## With the processing loops (ADR 0004)

Time-locked reveals, budget of 100 per run (the default), all due at the same instant, window 1h. "Before" is the same deployment with `PROCESSING_LOOPS=0` (the crons alone, as before the loops).

| run | loops | all broadcast in | broadcasts per minute | delay p50 / p99 |
| - | - | - | - | - |
| 600 players | 0 (crons only) | 6.1 min | 90, 90, 120, 80, 100, 90, 30 | 221s / 365s |
| 2000 players | 4 | 2.8 min | 810, 668, 522 | 79s / 163s |
| 2000 players | 8 | 1.3 min | 1577, 423 | 40s / 77s |
| 2000 players (repeat) | 8 | 1.4 min | 1590, 410 | 40s / 80s |

- **Cron alone**: `processQueue` handled 100 per run, 4.3 to 8.4s of CPU and 22 to 28.5s of wall time per run: about 100 per minute, the same as the morning's measurement.
- **One alarm** of a loop runs one `processQueue` (up to 100) then one `processTransactions` (up to 100): up to 10.7s of CPU (p99) and 41 to 48s of wall time during the burst, under the 30s CPU limit. So one loop does roughly 100 to 150 reveals per minute, and loops add up: 4 loops plus the cron gave about 700 per minute, 8 about 1600, with no error, no CPU limit hit and no D1 error. The next wall was not reached; candidates are D1 (one query at a time, about 9 statements per execution) and the RPC provider's rate limit.
- **Wall time, not CPU, bounds a run**: an invocation has at most 6 simultaneous outgoing connections, and each execution waits on several RPC round trips (through a tunnel here). More loops scale; more concurrency inside one run does not.
- **An idle loop** wakes every 5s (`PROCESSING_LOOP_IDLE_MS`); each idle alarm took 0.1 to 1s of CPU, mostly `setup` deriving the server account from the mnemonic on every internal request, plus two RPC requests per chain.
- **wrangler tail samples under load**: during the bursts it dropped most of the busy invocations, including their logs. The GraphQL analytics API (`durableObjectsInvocationsAdaptiveGroups`, `workersInvocationsAdaptive`, per-minute CPU and wall quantiles) has them all.

---
title: What one Cloudflare Worker cron run can process for fuzd
slug: cloudflare-worker-cron-capacity
source: 'measured on the fuzd-cf-worker-staging Worker (Workers Paid, D1 fuzd-db-staging in WEUR) with tests/load/reveal-burst.ts, chain = a local anvil reached through a trycloudflare tunnel, 2026-11-18; limits from developers.cloudflare.com/workers/platform/limits and /d1/platform/limits, both fetched 2026-11-18'
---

Measured, so the processing budget (`ProcessingBudget` in `@fuzd/common`) can be sized from numbers rather than guesses. The RPC went through a tunnel, so wall times are pessimistic compared to a hosted RPC.

- **Per execution, sequentially**: about 1.5s of wall time (one processQueue run of 10, called by hand: 14.9s), dominated by RPC round trips.
- **CPU per execution**: 45 to 100 ms, mostly the drand timelock decryption. 10 executions took 650 to 970 ms CPU; 100 took 4.1 to 7.3s; 200 took 9.2 to 20s. The documented cron limit is 30s of CPU for an interval under 1 hour, so 100 per run is safe and 200 is close to the edge.
- **Database**: 9.0 statements per execution, counted in `packages/server/test/queue-processing.test.ts`. The D1 docs say 1000 queries per Worker invocation on Workers Paid, yet runs of 200 executions (about 1800 statements) logged no D1 error. Batched statements may count as one query; not confirmed.
- **Throughput with the budget of 100, 10 concurrent**: exactly 100 executions per minute; 600 drained in 6 minutes. With 200 per run (staging only): 2000 in 10.3 minutes, the wall-time budget (40s) cutting some runs at 150.
- **Submissions**: about 34 players per second sustained at 50 concurrent requests, p99 under 2.5s; 36 per second at 200 concurrent, with latency rising (p50 3.9s). Submitting is far from the limit for a 23h commit phase.
- **Cron triggers**: new triggers took about 12 minutes to start firing after the first deploy (the docs say up to 15). Runs start around second 55 of each minute.
- **Global scope**: a Worker refuses to deploy when random values are generated at global scope (`crypto.getRandomValues`, error 10021), which is where `createServer` runs.
- **Beyond about 150 to 200 per minute**, one cron per minute is not enough: the work has to be spread over several invocations (several cron triggers mapped to processQueue, or a Queue consumer), each with its own CPU budget.

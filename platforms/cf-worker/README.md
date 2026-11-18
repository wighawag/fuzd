# fuzd on Cloudflare Workers

A Worker with a D1 database (`DB`). Its crons and a pool of Durable Object loops process the queue (`src/processing-loop.ts`, `docs/adr/0004-claim-due-items-with-a-lease.md`):

- `PROCESSING_LOOPS`: how many loops (1 by default, 0 for the crons alone). Each one runs `processQueue` then `processTransactions` from its alarm, again at once while a run stopped on its budget, else after `PROCESSING_LOOP_IDLE_MS` (5000). Measured on staging: roughly 100 to 150 reveals per minute per loop, plus about 100 per minute from the cron (`work/notes/findings/cloudflare-worker-cron-capacity.md`). An idle loop costs an alarm every 5s.
- `DISABLE_CRON` stops the crons and the loops.
- After upgrading an existing database, run `/admin/setup` (admin credentials): it adds the columns and indexes a new version needs, which `init-db` does not do for an existing table.

`pnpm test:node` runs the tests that need no Workers runtime (the processing loop).

# Issue Miniflare and linux

Fix: https://github.com/cloudflare/workers-sdk/issues/3262#issuecomment-1552855958

```bash
sudo apt install libc++1
```

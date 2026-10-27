---
title: fuzd is already a CLI, configured through env rather than flags
slug: fuzd-nodejs-cli-shape
source: 'derived from reading platforms/nodejs/src/cli.ts @ 7619366 (fuzd, branch feat/zod-validation) and ~/dev/github/wighawag/waxdb platforms/nodejs/src/cli.ts @ 4439768, 2026-10-27'
---

Context for the flag-driven `platforms/nodejs` CLI needed by stratagems' step 8. Not built here.

- `fuzd` (bin `fuzd`, commander 12) already runs `createServer` with `@hono/node-server` and `remote-sql-libsql`. Flags: only `--port` (default 3000) and `--process-interval` (seconds between processQueue/processTransactions/checkScheduledExecutionStatus, default 1, 0 disables).
- Everything else comes from the environment, loaded by `ldenv` with `.env.default` as default: `DB` (libsql URL), `HD_MNEMONIC`, `CHAIN_<chainId>` (`<rpc>#finality=..&worstCaseBlockTime=..&protocol=..`), `TIME_LOCK_DECRYPTION`, `PAYMENT_ACCOUNT`, `CONTRACT_TIMESTAMP`, `TOKEN_ADMIN`. It runs `/admin/setup` only when `DB` is `:memory:`.
- waxdb's `platforms/nodejs` (the shape to copy) puts the configuration on flags with defaults (`--port`, `--db` defaulting to `:memory:`, `--clear`, feature flags), spreads them over `process.env` into the server env, and has `test/cli.smoke.test.ts` and `test/nodejs.contract.test.ts`.
- Not verified: whether `@libsql/client` with `:memory:` keeps one database across `db.batch` calls; @fuzd/server's tests use a scratch-dir file DB instead.

---
'fuzd': minor
---

The CLI takes its configuration as flags, each overriding its environment variable (which still works): `--db` (`DB`, default `:memory:`, which runs the setup at start), `--chain <chainId>=<rpc>` (repeatable, `CHAIN_<chainId>`, with the `#finality=..&worstCaseBlockTime=..&protocol=..` suffix), `--mnemonic` (`HD_MNEMONIC`), `--admin-token` (`TOKEN_ADMIN`), `--time-lock-decryption <true|false>`, `--payment-account`, `--contract-timestamp`, `--dev` (`DEV=true`), beside `--port` (default 3000) and `--process-interval` (default 1). See its README.

`.env.default` no longer configures chain 31337 at `http://127.0.0.1:8545`: no chain is served unless one is given. A `:memory:` start with no admin token now uses a random one, and a failed setup stops the process. `@libsql/client` is now `^0.18.0`, which keeps a `:memory:` database across `transaction()` (0.14 to 0.17 lost it), and `remote-sql-libsql` `^0.0.7`.

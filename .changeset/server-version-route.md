---
'@fuzd/server': patch
---

`GET /` answers `fuzd api : <version>` with this package's version, instead of a fixed `0.7.0`. `/admin/setChainOverride` reads `DEV` through `getEnv`, so it works on node (the `fuzd` CLI) and not only where the env is Hono's bindings. `remote-sql` is now `^0.0.7` (the same code as 0.0.6), and the tests use `@libsql/client` `^0.18.0`.

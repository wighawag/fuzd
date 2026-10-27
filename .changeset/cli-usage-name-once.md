---
'@fuzd/client': patch
'fuzd': patch
---

`--help` no longer prints the command name twice (`Usage: fuzd fuzd ...`, `Usage: fuzd-client fuzd-client ...`), and `fuzd-client` starts again on Node 22+: it imported its package.json with `assert` (removed from Node) and from a path that does not exist in the published package.

---
'@fuzd/executor': patch
---

`getExecutionStatus({chainId, account, slot})` answers `undefined` for a slot it holds no execution for. It answered `'finalized'`, because the storage returns an empty list rather than nothing.

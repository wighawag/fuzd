---
'@fuzd/client': minor
---

`scheduleExecution` takes several transactions in one submission: pass `transactions: [...]` instead of `transaction`. The scheduler broadcasts them in that order, from the same remote account, at the submission's time, each readable at its index (`/api/execution/execution/:chainId/:account/:slot/:batchIndex`). The slot, timing, `maxFeePerGasAuthorized` (per transaction), `criticalDelta`, `paymentReserve`, `onBehalf` and `inClear` stay per submission; a time-locked batch is encrypted as one payload. The one-transaction form (`transaction`) is unchanged, byte for byte on the wire.

`computeTotalMaxCost` and `computeBalanceRequired` take `{maxFeePerGasAuthorized, transactions: [{gas, value?}, ...]}` as well as `{maxFeePerGasAuthorized, gas, value?}`: a batch costs the sum over its transactions of `gas * maxFeePerGasAuthorized`, the service's fees on that (fixed and proportional, charged per transaction as the executor charges each broadcast) and the transaction's value.

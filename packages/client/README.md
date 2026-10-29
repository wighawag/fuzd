# @fuzd/client

client for fuzd api

## Scheduling

```ts
import {createClient} from '@fuzd/client';

const client = createClient({privateKey, schedulerEndPoint: 'https://fuzd.example'});
const remoteAccount = await client.assignRemoteAccount('1');

// one transaction
await client.scheduleExecution({
	slot,
	chainId: '1',
	transaction: {to, data, gas: 100_000n},
	maxFeePerGasAuthorized,
	timing: {type: 'fixed-time', scheduledTime},
});

// several transactions in one submission: broadcast in this order, from the same remote account
await client.scheduleExecution({
	slot,
	chainId: '1',
	transactions: [
		{to, data: first, gas: 100_000n},
		{to, data: second, gas: 150_000n},
	],
	maxFeePerGasAuthorized,
	timing: {type: 'fixed-time', scheduledTime},
	paymentReserve: {amount, broadcaster: remoteAccount.address},
});
```

The slot, timing, `maxFeePerGasAuthorized` (the most each transaction may pay per gas), `paymentReserve`, `onBehalf` and `inClear` belong to the submission and apply to all of its transactions. Unless `inClear` is set, the whole list is time-locked together. Each transaction of a batch is then readable at its index (`/api/execution/execution/:chainId/:account/:slot/:batchIndex`).

`computeTotalMaxCost` and `computeBalanceRequired` take either `{maxFeePerGasAuthorized, gas, value?}` or `{maxFeePerGasAuthorized, transactions}`. For a batch the cost is the sum over its transactions of `gas * maxFeePerGasAuthorized`, plus the service's fees on that (charged per transaction, as the executor charges each broadcast), plus the transaction's value.

import {EIP1193ProviderWithoutEvents, EIP1193TransactionReceipt} from 'eip-1193';

export async function getTransactionStatus(
	provider: EIP1193ProviderWithoutEvents,
	transaction: {hash: `0x${string}`; nonce: number},
	finality: number
): Promise<
	| {finalised: true; blockTime: number; receipt: EIP1193TransactionReceipt; failed: boolean}
	| {finalised: false; blockTime?: number; receipt?: EIP1193TransactionReceipt; failed?: boolean}
> {
	let finalised = false;
	let blockTime: number | undefined;
	// TODO fix eip-1193 to make receipt response optional, is that a null ?
	const receipt = await provider.request({
		method: 'eth_getTransactionReceipt',
		params: [transaction.hash],
	});
	if (receipt) {
		const latestBlocknumberAshex = await provider.request({method: 'eth_blockNumber'});
		const latestBlockNumber = parseInt(latestBlocknumberAshex.slice(2), 16);
		const receiptBlocknumber = parseInt(receipt.blockNumber.slice(2), 16);

		if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
			throw new Error(
				`could not parse blocknumbers, latest: ${latestBlocknumberAshex}, receipt: ${receipt.blockNumber}`
			);
		}

		finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - finality);

		const block = await provider.request({
			method: 'eth_getBlockByHash',
			params: [receipt.blockHash, false],
		});
		blockTime = parseInt(block.timestamp.slice(2), 16);
	}

	let failed = false;
	if (receipt.status === '0x0') {
		failed = true;
	} else if (receipt.status === '0x1') {
		failed = false;
	} else {
		throw new Error(`Could not get the tx status for ${receipt.transactionHash} (status: ${receipt.status})`);
	}

	if (finalised) {
		return {
			finalised,
			blockTime: blockTime as number,
			receipt: receipt as EIP1193TransactionReceipt,
			failed: failed as boolean,
		};
	} else {
		return {
			finalised,
			blockTime,
			receipt,
			failed,
		};
	}
}

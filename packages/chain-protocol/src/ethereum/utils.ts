import {logs} from 'named-logs';
import type {EIP1193ProviderWithoutEvents, EIP1193TransactionReceipt} from 'eip-1193';
import {FUZDLogger, String0x} from 'fuzd-common';

const logger = <FUZDLogger>logs('fuzd-chain-protocol-ethereum-utils');

export async function getTransactionStatus(
	provider: EIP1193ProviderWithoutEvents,
	transaction: {hash: String0x; nonce: number},
	finality: number,
): Promise<
	| {finalised: true; blockTime: number; receipt: EIP1193TransactionReceipt; failed: boolean}
	| {finalised: false; blockTime?: number; receipt: EIP1193TransactionReceipt | null; failed?: boolean}
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
		const latestBlockNumber = Number(latestBlocknumberAshex);
		const receiptBlocknumber = Number(receipt.blockNumber);

		if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
			const errorMessage = `could not parse blocknumbers, latest: ${latestBlocknumberAshex}, receipt: ${receipt.blockNumber}`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const block = await provider.request({
			method: 'eth_getBlockByHash',
			params: [receipt.blockHash, false],
		});
		if (block) {
			blockTime = Number(block.timestamp);
			finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - finality);
		}
	}

	let failed: boolean | undefined;
	if (receipt) {
		if (receipt.status === '0x0') {
			failed = true;
		} else if (receipt.status === '0x1') {
			failed = false;
		} else {
			const errorMessage = `Could not get the tx status for ${receipt.transactionHash} (status: ${receipt.status})`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
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

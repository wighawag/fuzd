import {ChainProtocol, GasEstimate, Transaction, TransactionStatus} from '..';
import type {EIP1193Transaction, EIP1193TransactionReceipt, Methods} from 'eip-1193';
import type {CurriedRPC, RequestRPC} from 'remote-procedure-call';
import {createCurriedJSONRPC} from 'remote-procedure-call';
import {getRoughGasPriceEstimate} from './utils';

export class EthereumChainProtocol implements ChainProtocol {
	private rpc: CurriedRPC<Methods>;
	constructor(
		public readonly url: string | RequestRPC<Methods>,
		public readonly config: {expectedFinality: number; worstCaseBlockTime: number; contractTimestamp?: `0x${string}`},
	) {
		this.rpc = createCurriedJSONRPC<Methods>(url);
	}

	async getTransactionStatus(transaction: Transaction, finality: number): Promise<TransactionStatus> {
		let finalised = false;
		let blockTime: number | undefined;
		// TODO fix eip-1193 to make receipt response optional, is that a null ?
		const receipt = await this.rpc.request({
			method: 'eth_getTransactionReceipt',
			params: [transaction.hash],
		});
		if (receipt) {
			const latestBlocknumberAshex = await this.rpc.request({method: 'eth_blockNumber'});
			const latestBlockNumber = Number(latestBlocknumberAshex);
			const receiptBlocknumber = Number(receipt.blockNumber);

			if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
				throw new Error(
					`could not parse blocknumbers, latest: ${latestBlocknumberAshex}, receipt: ${receipt.blockNumber}`,
				);
			}

			const block = await this.rpc.request({
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
				throw new Error(`Could not get the tx status for ${receipt.transactionHash} (status: ${receipt.status})`);
			}
		}

		if (finalised) {
			return {
				finalised,
				blockTime: blockTime as number,
				failed: failed as boolean,
			};
		} else {
			return {
				finalised,
				blockTime,
				failed,
				pending: receipt ? true : false,
			};
		}
	}

	async isTransactionFinalised(
		txHash: `0x${string}`,
	): Promise<{finalised: true} | {finalised: false; pending: boolean}> {
		let receipt: EIP1193TransactionReceipt | null;
		try {
			receipt = await this.rpc.request({
				method: 'eth_getTransactionReceipt',
				params: [txHash],
			});
		} catch (err) {
			// logger.error('ERROR fetching receipt', err);
			receipt = null;
		}

		let finalised = false;
		if (receipt) {
			const latestBlocknumberAshex = await this.rpc.request({
				method: 'eth_blockNumber',
			});
			const latestBlockNumber = Number(latestBlocknumberAshex);
			const transactionBlockNumber = Number(receipt.blockNumber);
			finalised = latestBlockNumber - this.config.expectedFinality >= transactionBlockNumber;
		}

		if (finalised) {
			return {finalised};
		} else {
			return {finalised, pending: receipt ? true : false};
		}
	}

	async isTransactionPending(txHash: `0x${string}`): Promise<boolean> {
		let pendingTansaction: EIP1193Transaction | null;
		try {
			pendingTansaction = await this.rpc.request({
				method: 'eth_getTransactionByHash',
				params: [txHash],
			});
		} catch (err) {
			// logger.error(`failed to get pending transaction`, err);
			pendingTansaction = null;
		}
		return pendingTansaction ? true : false;
	}

	async getBalance(account: `0x${string}`): Promise<bigint> {
		const balanceString = await this.rpc.request({
			method: 'eth_getBalance',
			params: [account, 'latest'],
		});
		return BigInt(balanceString);
	}

	async broadcastSignedTransaction(tx: any): Promise<`0x${string}`> {
		const txHash = await this.rpc.request({
			method: 'eth_sendRawTransaction',
			params: [tx],
		});
		return txHash;
	}

	async getNonce(account: `0x${string}`): Promise<`0x${string}`> {
		const nonceAsHex = await this.rpc.request({
			method: 'eth_getTransactionCount',
			params: [account, 'latest'],
		});
		return nonceAsHex;
	}

	async estimateGasNeeded(tx: any): Promise<bigint> {
		const gas = await this.rpc.request({
			method: 'eth_estimateGas',
			params: [tx],
		});
		return BigInt(gas);
	}

	async getGasFee(executionData: {maxFeePerGasAuthorized: `0x${string}`}): Promise<GasEstimate> {
		const maxFeePerGasAuthorized = BigInt(executionData.maxFeePerGasAuthorized);

		const estimates = await getRoughGasPriceEstimate(this.rpc);
		const gasPriceEstimate = estimates.average;
		let maxFeePerGas = gasPriceEstimate.maxFeePerGas;
		let maxPriorityFeePerGas = gasPriceEstimate.maxPriorityFeePerGas;
		if (gasPriceEstimate.maxFeePerGas > maxFeePerGasAuthorized) {
			// logger.warn(
			// 	`fast.maxFeePerGas (${gasPriceEstimate.maxFeePerGas}) > maxFeePerGasChosen (${maxFeePerGasAuthorized}), tx might not be included`,
			// );
			maxFeePerGas = maxFeePerGasAuthorized;
			if (maxPriorityFeePerGas > maxFeePerGas) {
				maxPriorityFeePerGas = maxFeePerGas;
			}
		}

		return {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate};
	}

	offset = 0;
	async getTimestamp(): Promise<number> {
		if (this.config.contractTimestamp) {
			const result = await this.rpc.request({
				method: 'eth_call',
				params: [
					{
						to: this.config.contractTimestamp,
						data: '0xb80777ea', // timestamp()
					},
				],
			});
			const value = Number(result);
			return value;
		}

		const block = await this.rpc.request({method: 'eth_getBlockByNumber', params: ['latest', false]});
		if (!block) {
			throw new Error(`cannot get latest block`);
		}
		return Number(block.timestamp) + this.offset;
	}
	async increaseTime(amount: number): Promise<void> {
		this.offset += amount;
	}
}

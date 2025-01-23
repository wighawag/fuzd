import {logs} from 'named-logs';
import {
	BroadcasterSignerData,
	ChainProtocol,
	GasEstimate,
	SignedTransactionInfo,
	Transaction,
	TransactionStatus,
} from '../index.js';
import type {EIP1193Transaction, EIP1193TransactionReceipt, Methods} from 'eip-1193';
import type {CurriedRPC, RequestRPC} from 'remote-procedure-call';
import {createCurriedJSONRPC} from 'remote-procedure-call';
import {getRoughGasPriceEstimate} from './utils.js';
import {DerivationParameters, fromHex, IntegerString, String0x, toHex, TransactionParametersUsed} from 'fuzd-common';
import type {FullEthereumTransactionData, EthereumTransactionData} from './types.js';
import type {ETHAccount} from 'remote-account';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {keccak_256} from '@noble/hashes/sha3';
export type * from './types.js';

const logger = logs('fuzd-chain-protocol-ethereum');

export class EthereumChainProtocol implements ChainProtocol<EthereumTransactionData> {
	private rpc: CurriedRPC<Methods>;
	constructor(
		public readonly url: string | RequestRPC<Methods>,
		public readonly config: {
			expectedFinality: number;
			worstCaseBlockTime: number;
			contractTimestamp?: String0x;
		},
	) {
		this.rpc = createCurriedJSONRPC<Methods>(url);
	}

	async getTransactionStatus(transaction: Transaction): Promise<TransactionStatus> {
		let finalised = false;
		let blockTime: number | undefined;
		let receipt: EIP1193TransactionReceipt | null;
		try {
			receipt = await this.rpc.request({
				method: 'eth_getTransactionReceipt',
				params: [transaction.hash],
			});
		} catch (err) {
			return {success: false, error: err};
		}

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
				finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - this.config.expectedFinality);
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

		if (finalised && receipt) {
			return {
				success: true,
				finalised: true,
				blockTime: blockTime as number,
				failed: failed as boolean,
				cost: BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice),
			};
		} else {
			return {
				success: true,
				finalised: false,
				blockTime,
				failed,
				pending: receipt ? true : false,
			};
		}
	}

	async isTransactionPending(txHash: String0x): Promise<boolean> {
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

	async getBalance(account: String0x): Promise<bigint> {
		const balanceString = await this.rpc.request({
			method: 'eth_getBalance',
			params: [account, 'latest'],
		});
		return BigInt(balanceString);
	}

	async broadcastSignedTransaction(tx: any): Promise<String0x> {
		const txHash = await this.rpc.request({
			method: 'eth_sendRawTransaction',
			params: [tx],
		});
		return txHash;
	}

	async getNonce(account: String0x): Promise<String0x> {
		const nonceAsHex = await this.rpc.request({
			method: 'eth_getTransactionCount',
			params: [account, 'latest'],
		});
		return nonceAsHex;
	}

	async getGasFee(executionData: {maxFeePerGasAuthorized: String0x}): Promise<GasEstimate> {
		// TODO it should be the executor handling maxFeePerGasAuthorized ?
		// unless we want to handle multideimensional gas supported on some network (starknet) and not others (evm)
		const maxFeePerGasAuthorized = BigInt(executionData.maxFeePerGasAuthorized);

		const estimates = await getRoughGasPriceEstimate(this.rpc);
		const gasPriceEstimate = estimates.average;
		let maxFeePerGas = gasPriceEstimate.maxFeePerGas;
		let maxPriorityFeePerGas = gasPriceEstimate.maxPriorityFeePerGas;
		if (gasPriceEstimate.maxFeePerGas > maxFeePerGasAuthorized) {
			logger.warn(
				`estimate maxFeePerGas (${gasPriceEstimate.maxFeePerGas}) > maxFeePerGasAuthorized (${maxFeePerGasAuthorized}), tx might not be included. we keep the estimated priorityFee (${maxPriorityFeePerGas}) if it still under`,
			);
			maxFeePerGas = maxFeePerGasAuthorized;
			if (maxPriorityFeePerGas > maxFeePerGas) {
				maxPriorityFeePerGas = maxFeePerGas;
			}
		}

		if (maxFeePerGas == 0n) {
			maxFeePerGas = 1n;
		}

		return {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate};
	}

	async validateDerivationParameters(
		parameters: DerivationParameters,
	): Promise<{success: true} | {success: false; error: string}> {
		const validation = await this._validateDerivationParameters(parameters);
		if (!validation.success) {
			return validation;
		}

		return {success: true};
	}
	async getDerivationParameters(account: ETHAccount): Promise<DerivationParameters> {
		return {
			type: 'ethereum',
			data: account.publicExtendedKey,
		};
	}
	async getBroadcaster(
		account: ETHAccount,
		parameters: DerivationParameters,
		forAddress: String0x,
	): Promise<BroadcasterSignerData> {
		const validation = await this.validateDerivationParameters(parameters);
		if (!validation.success) {
			throw new Error(validation.error);
		}
		const derivedAccount = account.deriveForAddress(forAddress);
		return {
			signer: `privateKey:${derivedAccount.privateKey}`,
			address: derivedAccount.address,
		};
	}

	async checkValidity(
		chainId: IntegerString,
		transactionData: EthereumTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<{revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean}> {
		if (!transactionData.gas) {
			throw new Error(`invalid transaction data, no gas parameter`);
		}
		let gasRequired: bigint;
		try {
			gasRequired = await this._estimateGasNeeded({
				...transactionData,
				from: broadcaster.address,
			});
		} catch (err: any) {
			if (err.isInvalidError) {
				return {revert: 'unknown'}; // TODO add error message
			} else if (err.message?.indexOf('revert')) {
				// not 100% sure ?
				// TODO error message // viem
				// logger.error('The transaction reverts?', err, {
				// 	from: broadcasterAddress,
				// 	to: transactionData.to,
				// 	data: transactionData.data,
				// 	value: transactionData.value,
				// });
				return {notEnoughGas: true, revert: true};
			} else {
				return {revert: 'unknown'}; // TODO add error message
			}
		}
		return {notEnoughGas: gasRequired > BigInt(transactionData.gas) ? true : false, revert: false};
	}

	async computeMaxCost(
		chainId: IntegerString,
		transactionData: EthereumTransactionData,
		maxFeePerGasAuthorized: String0x,
	): Promise<bigint> {
		const maxCost = BigInt(transactionData.gas) * BigInt(maxFeePerGasAuthorized);

		return maxCost;
	}

	async signTransaction(
		chainId: IntegerString,
		transactionData: EthereumTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo> {
		let signer: EIP1193LocalSigner;
		const [protocol, protocolData] = broadcaster.signer.split(':');
		if (protocol === 'privateKey') {
			signer = new EIP1193LocalSigner(protocolData as String0x);
		} else {
			throw new Error(`protocol ${protocol} not supported`);
		}

		const actualTransactionData: FullEthereumTransactionData = {
			type: transactionData.type,
			accessList: transactionData.accessList,
			chainId: `0x${Number(chainId).toString(16)}`,
			data: transactionData.data,
			gas: transactionData.gas,
			to: transactionData.to,
			value: transactionData.value,
			nonce: transactionParameters.nonce,
			from: broadcaster.address,
			maxFeePerGas: transactionParameters.maxFeePerGas,
			maxPriorityFeePerGas: transactionParameters.maxPriorityFeePerGas,
		};

		const rawTx = await signer.request({
			method: 'eth_signTransaction',
			params: [actualTransactionData],
		});
		const hash = toHex(keccak_256(fromHex(rawTx)));
		return {
			rawTx,
			hash,
		};
	}

	async signVoidTransaction(
		chainId: IntegerString,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo> {
		let signer: EIP1193LocalSigner;
		const [protocol, protocolData] = broadcaster.signer.split(':');
		if (protocol === 'privateKey') {
			signer = new EIP1193LocalSigner(protocolData as String0x);
		} else {
			throw new Error(`protocol ${protocol} not supported`);
		}

		// logger.error('already done, sending dummy transaction');
		try {
			// compute maxFeePerGas and maxPriorityFeePerGas to fill the total gas cost  * price that was alocated
			// maybe not fill but increase from previoyus considering current fee and allowance
			const actualTransactionData: FullEthereumTransactionData = {
				type: '0x2',
				from: broadcaster.address,
				to: broadcaster.address,
				nonce: transactionParameters.nonce,
				maxFeePerGas: transactionParameters.maxFeePerGas,
				maxPriorityFeePerGas: transactionParameters.maxPriorityFeePerGas,
				chainId: `0x${Number(chainId).toString(16)}`,
				gas: `0x${(21000).toString(16)}`,
			};
			const rawTx = await signer.request({
				method: 'eth_signTransaction',
				params: [actualTransactionData],
			});
			const hash = toHex(keccak_256(fromHex(rawTx)));
			return {
				rawTx,
				hash,
			};
		} catch (e) {
			// logger.error(`FAILED TO SEND DUMMY TX`, e);
			// TODO do something
			throw e;
		}
	}

	generatePaymentTransaction(
		transactionData: EthereumTransactionData,
		maxFeePerGas: bigint,
		from: String0x,
		diffToCover: bigint,
	): {transaction: EthereumTransactionData; cost: bigint} {
		const gas = BigInt(30000);
		const cost = gas * maxFeePerGas; // TODO handle extra Fee like Optimism
		const valueToSend = diffToCover * BigInt(transactionData.gas);
		const transactionToBroadcast: EthereumTransactionData = {
			gas: `0x${gas.toString(16)}` as String0x,
			to: from,
			type: '0x2',
			value: `0x${valueToSend.toString(16)}` as String0x,
		};
		return {transaction: transactionToBroadcast as EthereumTransactionData, cost};
	}

	// TODO FOR TEST ONLY
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
			if (isNaN(value)) {
				throw new Error(`could not get timestamp from contract, ${result}`);
			}
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

	// ---------------------------------------------
	// INTERNAL
	// ---------------------------------------------

	async _validateDerivationParameters(
		parameters: DerivationParameters,
	): Promise<{success: true} | {success: false; error: string}> {
		if (parameters.type !== 'ethereum') {
			return {success: false, error: `invalid type: ${parameters.type}`};
		}

		return {success: true};
	}

	async _estimateGasNeeded(tx: any): Promise<bigint> {
		const gas = await this.rpc.request({
			method: 'eth_estimateGas',
			params: [tx],
		});
		return BigInt(gas);
	}
}

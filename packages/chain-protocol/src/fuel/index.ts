import {logs} from 'named-logs';
import {
	BroadcasterSignerData,
	ChainProtocol,
	GasEstimate,
	SignedTransactionInfo,
	Transaction,
	TransactionStatus,
} from '../index.js';
import {
	DerivationParameters,
	fromHex,
	FUZDLogger,
	getBestGasEstimate,
	IntegerString,
	String0x,
	toHex,
	TransactionParametersUsed,
} from 'fuzd-common';
import type {FuelTransactionData} from './types.js';
import type {ETHAccount} from 'remote-account';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {keccak_256} from '@noble/hashes/sha3';
import {Provider, Wallet} from 'fuels';

export * from './types.js';

const logger = <FUZDLogger>logs('fuzd-chain-protocol-fuel');

export class FuelChainProtocol implements ChainProtocol<FuelTransactionData> {
	private rpc: Provider;
	constructor(
		public readonly url: string,
		public readonly config: {
			baseAsssetId: string;
			expectedFinality: number;
			worstCaseBlockTime: number;
			contractTimestamp?: String0x;
		},
	) {
		this.rpc = new Provider(url);
	}

	async getTransactionStatus(transaction: Transaction): Promise<TransactionStatus> {
		// TODO
		throw new Error('Not implemented');
	}

	async isTransactionPending(txHash: String0x): Promise<boolean> {
		// TODO
		throw new Error('Not implemented');
	}

	async getBalance(account: String0x): Promise<bigint> {
		const balance = await this.rpc.getBalance(account, this.config.baseAsssetId);
		return BigInt(balance.toString(10));
	}

	async broadcastSignedTransaction(tx: any): Promise<String0x> {
		// TODO
		throw new Error('Not implemented');
	}

	async getNonce(account: String0x): Promise<String0x> {
		// TODO
		throw new Error('Not implemented');
	}

	async getGasFee(executionData: {maxFeePerGasAuthorized: String0x}, importanceRatio: number): Promise<GasEstimate> {
		// TODO
		throw new Error('Not implemented');
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
			type: 'fuel',
			data: account.publicExtendedKey, // TODO someting else ?
		};
	}
	async getBroadcaster(
		account: ETHAccount,
		parameters: DerivationParameters,
		forAddress: String0x,
	): Promise<BroadcasterSignerData> {
		const validation = await this.validateDerivationParameters(parameters);
		if (!validation.success) {
			logger.error(validation.error);
			throw new Error(validation.error);
		}
		const derivedAccount = account.deriveForAddress(forAddress);
		const wallet = Wallet.fromPrivateKey(derivedAccount.privateKey);
		return {
			signer: `privateKey:${derivedAccount.privateKey}`,
			address: wallet.address.toAddress() as `0x${string}`, // TODO accept string everywhere in FUZD ?
		};
	}

	async checkValidity(
		chainId: IntegerString,
		transactionData: FuelTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<{revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean}> {
		// TODO
		throw new Error('Not implemented');
	}

	async computeMaxCostAuthorized(
		chainId: IntegerString,
		transactionData: FuelTransactionData,
		maxFeePerGasAuthorized: String0x,
	): Promise<bigint> {
		// TODO
		throw new Error('Not implemented');
		// const maxCost = BigInt(transactionData.gas) * BigInt(maxFeePerGasAuthorized);
		// return maxCost;
	}

	async signTransaction(
		chainId: IntegerString,
		transactionData: FuelTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo> {
		// TODO
		throw new Error('Not implemented');
	}

	async signVoidTransaction(
		chainId: IntegerString,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo> {
		// TODO
		throw new Error('Not implemented');
	}

	generatePaymentTransaction(
		transactionData: FuelTransactionData,
		maxFeePerGas: bigint,
		from: String0x,
		diffToCover: bigint,
	): {transaction: FuelTransactionData; cost: bigint; valueSent: bigint} {
		const gas = BigInt(30000); // TODO ?
		const cost = gas * maxFeePerGas; // TODO handle extra Fee like Optimism
		const valueToSend = diffToCover * BigInt(transactionData.maxFee || 0); // TODO maxFee not present ?
		// TODO
		throw new Error('Not implemented');
	}

	// TODO FOR TEST ONLY
	offset = 0;
	async getTimestamp(): Promise<number> {
		// TODO support Time contracts
		// if (this.config.contractTimestamp) {
		// 	const result = await this.rpc.request({
		// 		method: 'eth_call',
		// 		params: [
		// 			{
		// 				to: this.config.contractTimestamp,
		// 				data: '0xb80777ea', // timestamp()
		// 			},
		// 		],
		// 	});
		// 	const value = Number(result);
		// 	return value;
		// }

		const blockResponse = await this.rpc.getBlock('latest');
		if (!blockResponse) {
			throw new Error(`could not fetch block`);
		}
		return Number(blockResponse.time) + this.offset;\
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
		if (parameters.type !== 'fuel') {
			return {success: false, error: `invalid type: ${parameters.type}`};
		}

		return {success: true};
	}

	async _estimateGasNeeded(tx: any): Promise<bigint> {
		// TODO tx value might be transformed
		const estimation = await this.rpc.estimateTxGasAndFee(tx);
		return BigInt(estimation.maxFee.toString(10));
	}
}

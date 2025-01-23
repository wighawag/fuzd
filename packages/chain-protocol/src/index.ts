/**
 * Type defintion for fuzd-chain-protocol
 * @module
 */

import {DerivationParameters, IntegerString, String0x, TransactionParametersUsed} from 'fuzd-common';
import {ETHAccount} from 'remote-account';

export type TransactionStatus =
	| {
			success: true;
			finalised: true;
			blockTime: number;
			failed: boolean;
			cost: bigint;
	  }
	| {
			success: true;
			finalised: false;
			blockTime?: number;
			failed?: boolean;
			pending: boolean;
	  }
	| {
			success: false;
			error: any;
	  };

export type Transaction = {
	hash: String0x;
	nonce: String0x;
};

export interface SchedulerChainProtocol {
	config: {
		expectedFinality: number;
		worstCaseBlockTime: number;
	};
	getTransactionStatus(transaction: Transaction): Promise<TransactionStatus>;

	getTimestamp(): Promise<number>;

	increaseTime(amount: number): Promise<void>;
}

export type GasPrice = {
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
};

export type GasEstimate = GasPrice & {gasPriceEstimate: GasPrice};

export type TransactionValidity = {revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean};

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {signer: string; address: String0x};
// ------------------------------------------------------------------------------------------------

export type SignedTransactionInfo = {
	rawTx: any;
	hash: String0x;
};

export type Validation<T> = ValidationSuccess<T> | ValidationFailure;

export interface ValidationSuccess<T> {
	success: true;
	data: T;
}
export interface ValidationFailure {
	success: false;
	errors: any[];
}

export interface ExecutorChainProtocol<TransactionDataType> {
	getTransactionStatus(transaction: Transaction): Promise<TransactionStatus>;
	isTransactionPending(txHash: String0x): Promise<boolean>;
	getBalance(account: String0x): Promise<bigint>;
	broadcastSignedTransaction(tx: any): Promise<String0x>;
	getNonce(account: String0x): Promise<String0x>;
	getGasFee(executionData: {maxFeePerGasAuthorized: String0x}): Promise<GasEstimate>;

	requiredPreliminaryTransaction?(
		chainId: IntegerString,
		broadcaster: BroadcasterSignerData,
		account: String0x,
	): TransactionDataType;

	validateDerivationParameters(
		parameters: DerivationParameters,
	): Promise<{success: true} | {success: false; error: string}>;
	getDerivationParameters(account: ETHAccount): Promise<DerivationParameters>;
	getBroadcaster(
		account: ETHAccount,
		parameters: DerivationParameters,
		forAddress: String0x,
	): Promise<BroadcasterSignerData>;

	checkValidity(
		chainId: IntegerString,
		data: TransactionDataType,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<TransactionValidity>;

	computeMaxCostAuthorized(
		chainId: IntegerString,
		transactionData: TransactionDataType,
		maxFeePerGasAuthorized: String0x,
	): Promise<bigint>;
	signTransaction(
		chainId: IntegerString,
		data: TransactionDataType,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo>;
	signVoidTransaction?(
		chainId: IntegerString,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo>;

	generatePaymentTransaction(
		transaction: TransactionDataType,
		maxFeePerGas: bigint,
		from: String0x,
		diffToCover: bigint,
	): {transaction: TransactionDataType; cost: bigint; valueSent: bigint};
}

export type ChainProtocol<TransactionDataType> = SchedulerChainProtocol & ExecutorChainProtocol<TransactionDataType>;

// ------------------------------------------------------------------------------------------------
// ChainProtocols
// ------------------------------------------------------------------------------------------------
type ExtractTransactionDataType<T> = T extends ChainProtocol<infer U> ? U : never;

export type TransactionDataTypes<ChainProtocolTypes extends ChainProtocol<any>> =
	ExtractTransactionDataType<ChainProtocolTypes>;

export type ChainProtocols<ChainProtocolTypes extends ChainProtocol<any>> = {
	[chainId: IntegerString]: ChainProtocol<TransactionDataTypes<ChainProtocolTypes>>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

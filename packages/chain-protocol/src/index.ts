import {DerivationParameters, ExecutionSubmission, TransactionParametersUsed} from 'fuzd-common';

export type TransactionStatus =
	| {
			success: true;
			finalised: true;
			blockTime: number;
			failed: boolean;
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
	hash: `0x${string}`;
	nonce: `0x${string}`;
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
export type BroadcasterSignerData = {signer: string; address: `0x${string}`};
// ------------------------------------------------------------------------------------------------

export type SignedTransactionInfo = {
	rawTx: any;
	hash: `0x${string}`;
};

export interface ExecutorChainProtocol<TransactionDataType> {
	getTransactionStatus(transaction: Transaction): Promise<TransactionStatus>;
	isTransactionPending(txHash: `0x${string}`): Promise<boolean>;
	getBalance(account: `0x${string}`): Promise<bigint>;
	broadcastSignedTransaction(tx: any): Promise<`0x${string}`>;
	getNonce(account: `0x${string}`): Promise<`0x${string}`>;
	getGasFee(executionData: {maxFeePerGasAuthorized: `0x${string}`}): Promise<GasEstimate>;
	parseExecutionSubmission(
		execution: ExecutionSubmission<TransactionDataType>,
	): ExecutionSubmission<TransactionDataType>;

	requiredPreliminaryTransaction?(
		chainId: string,
		broadcaster: BroadcasterSignerData,
		account: `0x${string}`,
	): TransactionDataType;

	validateDerivationParameters(
		parameters: DerivationParameters,
	): Promise<{success: true} | {success: false; error: string}>;
	getCurrentDerivationParameters(): Promise<DerivationParameters>;
	getBroadcaster(parameters: DerivationParameters, forAddress: `0x${string}`): Promise<BroadcasterSignerData>;

	checkValidity(
		chainId: `0x${string}`,
		data: TransactionDataType,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<TransactionValidity>;
	signTransaction(
		chainId: `0x${string}`,
		data: TransactionDataType,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo>;
	signVoidTransaction?(
		chainId: `0x${string}`,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<SignedTransactionInfo>;

	generatePaymentTransaction(
		transaction: TransactionDataType,
		maxFeePerGas: bigint,
		from: `0x${string}`,
		diffToCover: bigint,
	): {transaction: TransactionDataType; cost: bigint};
}

export type ChainProtocol<TransactionDataType> = SchedulerChainProtocol & ExecutorChainProtocol<TransactionDataType>;

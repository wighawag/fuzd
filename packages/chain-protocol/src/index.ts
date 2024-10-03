import {ExecutionSubmission, TransactionParametersUsed, TransactionParams} from 'fuzd-common';

export type TransactionStatus =
	| {
			finalised: true;
			blockTime: number;
			failed: boolean;
	  }
	| {
			finalised: false;
			blockTime?: number;
			failed?: boolean;
			pending: boolean;
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
	getTransactionStatus(transaction: Transaction, finality: number): Promise<TransactionStatus>;

	getTimestamp(): Promise<number>;

	increaseTime(amount: number): Promise<void>;
}

export type GasPrice = {
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
};

export type GasEstimate = GasPrice & {gasPriceEstimate: GasPrice};

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {assignerID: string; signer: string; address: `0x${string}`};
// ------------------------------------------------------------------------------------------------

export interface ExecutorChainProtocol {
	isTransactionFinalised(txHash: `0x${string}`): Promise<{finalised: true} | {finalised: false; pending: boolean}>;
	isTransactionPending(txHash: `0x${string}`): Promise<boolean>;
	getBalance(account: `0x${string}`): Promise<bigint>;
	broadcastSignedTransaction(tx: any): Promise<`0x${string}`>;
	getNonce(account: `0x${string}`): Promise<`0x${string}`>;
	estimateGasNeeded(tx: any): Promise<bigint>;
	getGasFee(executionData: {maxFeePerGasAuthorized: `0x${string}`}): Promise<GasEstimate>;
	parseExecutionSubmission<TransactionDataType>(
		execution: ExecutionSubmission<TransactionDataType>,
	): ExecutionSubmission<TransactionDataType>;

	assignProviderFor(chainId: `0x${string}`, forAddress: `0x${string}`): Promise<BroadcasterSignerData>;
	getProviderByAssignerID(assignerID: string, forAddress: `0x${string}`): Promise<BroadcasterSignerData>;

	checkValidity<TransactionDataType>(
		broadcasterAddress: `0x${string}`,
		transactionData: Partial<TransactionDataType>,
	): Promise<{revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean}>;
	signTransaction<TransactionDataType>(
		chainId: `0x${string}`,
		data: Partial<TransactionDataType>,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
		options: {
			forceVoid?: boolean;
			nonceIncreased: boolean;
		},
	): Promise<{
		rawTx: any;
		hash: `0x${string}`;
		transactionData: TransactionDataType;
		isVoidTransaction: boolean;
	}>;

	generatePaymentTransaction<TransactionDataType>(
		transaction: TransactionDataType,
		maxFeePerGas: bigint,
		from: `0x${string}`,
		diffToCover: bigint,
	): {transaction: TransactionDataType; cost: bigint};
}

export type ChainProtocol = SchedulerChainProtocol & ExecutorChainProtocol;

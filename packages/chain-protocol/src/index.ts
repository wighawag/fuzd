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

export interface ExecutorChainProtocol {
	isTransactionFinalised(txHash: `0x${string}`): Promise<{finalised: true} | {finalised: false; pending: boolean}>;
	isTransactionPending(txHash: `0x${string}`): Promise<boolean>;
	getBalance(account: `0x${string}`): Promise<bigint>;
	broadcastSignedTransaction(tx: any): Promise<`0x${string}`>;
	getNonce(account: `0x${string}`): Promise<`0x${string}`>;
	estimateGasNeeded(tx: any): Promise<bigint>;
	getGasFee(executionData: {maxFeePerGasAuthorized: `0x${string}`}): Promise<GasEstimate>;
}

export type ChainProtocol = SchedulerChainProtocol & ExecutorChainProtocol;

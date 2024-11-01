import {ExpectedWorstCaseGasPrice, PendingExecutionStored, String0x} from 'fuzd-common';

export type BroadcasterData = {
	chainId: String0x;
	nextNonce: number;
	address: String0x;
};

export interface ExecutorStorage<TransactionDataType> {
	getPendingExecution(params: {
		chainId: String0x;
		account: String0x;
		slot: string;
		batchIndex: number;
	}): Promise<PendingExecutionStored<TransactionDataType> | undefined>;

	getPendingExecutionBatch(params: {
		chainId: String0x;
		account: String0x;
		slot: string;
	}): Promise<PendingExecutionStored<TransactionDataType>[] | undefined>;

	deletePendingExecution(params: {
		chainId: String0x;
		account: String0x;
		slot: string;
		batchIndex: number;
	}): Promise<void>;
	createOrUpdatePendingExecutionAndUpdateNonceIfNeeded(
		executionToStore: PendingExecutionStored<TransactionDataType>,
		asPaymentFor?: {
			chainId: String0x;
			account: String0x;
			slot: string;
			batchIndex: number;
			upToGasPrice: bigint;
		},
	): Promise<PendingExecutionStored<TransactionDataType>>;
	getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]>;
	getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: String0x;
			broadcaster: String0x;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored<TransactionDataType>[]>;

	getAllExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]>;

	// TODO remove: createBroadcaster is not used, and if used we should use updateBroadcaster too
	getBroadcaster(params: {chainId: String0x; address: string}): Promise<BroadcasterData | undefined>;
	createBroadcaster(broadcaster: BroadcasterData): Promise<void>;
	clear(): Promise<void>;
	setup(): Promise<void>;
	getExpectedWorstCaseGasPrice(chainId: String0x): Promise<ExpectedWorstCaseGasPrice>;
	updateExpectedWorstCaseGasPrice(
		chainId: String0x,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<ExpectedWorstCaseGasPrice>;
}

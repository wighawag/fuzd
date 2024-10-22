import {ExpectedWorstCaseGasPrice, PendingExecutionStored} from 'fuzd-common';

export type BroadcasterData = {
	chainId: `0x${string}`;
	nextNonce: number;
	address: `0x${string}`;
};

export interface ExecutorStorage<TransactionDataType> {
	getPendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
		batchIndex: number;
	}): Promise<PendingExecutionStored<TransactionDataType> | undefined>;

	getPendingExecutionBatch(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<PendingExecutionStored<TransactionDataType>[] | undefined>;

	deletePendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
		batchIndex: number;
	}): Promise<void>;
	createOrUpdatePendingExecutionAndUpdateNonceIfNeeded(
		executionToStore: PendingExecutionStored<TransactionDataType>,
		asPaymentFor?: {
			chainId: `0x${string}`;
			account: `0x${string}`;
			slot: string;
			batchIndex: number;
			upToGasPrice: bigint;
		},
	): Promise<PendingExecutionStored<TransactionDataType>>;
	getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]>;
	getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: `0x${string}`;
			broadcaster: `0x${string}`;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored<TransactionDataType>[]>;

	getAllExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]>;

	// TODO remove: createBroadcaster is not used, and if used we should use updateBroadcaster too
	getBroadcaster(params: {chainId: `0x${string}`; address: string}): Promise<BroadcasterData | undefined>;
	createBroadcaster(broadcaster: BroadcasterData): Promise<void>;
	clear(): Promise<void>;
	setup(): Promise<void>;
	getExpectedWorstCaseGasPrice(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice>;
	updateExpectedWorstCaseGasPrice(
		chainId: `0x${string}`,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<ExpectedWorstCaseGasPrice>;
}

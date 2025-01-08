import {PendingExecutionStored, String0x, UpdateableParameter} from 'fuzd-common';

export type BroadcasterData = {
	chainId: String0x;
	address: String0x;
	nextNonce: number;
	lock: string | null;
	lock_timestamp: number | null;

	// debt: bigint;
	// debtCounter: number;
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

	lockBroadcaster(params: {
		chainId: String0x;
		address: string;
		nonceFromNetwork: number;
	}): Promise<BroadcasterData | undefined>;

	unlockBroadcaster(params: {chainId: String0x; address: string}): Promise<void>;

	createOrUpdatePendingExecution(
		executionToStore: PendingExecutionStored<TransactionDataType>,
		{updateNonceIfNeeded}: {updateNonceIfNeeded: boolean},
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
	getExpectedWorstCaseGasPrice(chainId: String0x): Promise<UpdateableParameter<string>>;
	updateExpectedWorstCaseGasPrice(
		chainId: String0x,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<UpdateableParameter<string>>;
}

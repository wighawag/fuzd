import {ExpectedWorstCaseGasPrice, EIP1193TransactionDataUsed} from 'fuzd-common';

export type BroadcasterData = {
	chainId: `0x${string}`;
	nextNonce: number;
	address: `0x${string}`;
};

export type PendingExecutionStored = {
	chainId: `0x${string}`;
	account: `0x${string}`;
	slot: string;
	batchIndex: number;
	onBehalf?: `0x${string}`;
	broadcasterAssignerID: string;
	transaction: EIP1193TransactionDataUsed;
	initialTime: number;
	broadcastTime?: number;
	nextCheckTime: number;
	hash: `0x${string}`;
	maxFeePerGasAuthorized: `0x${string}`;
	helpedForUpToGasPrice?: `0x${string}`;
	isVoidTransaction: boolean;
	finalized: boolean;
	retries?: number;
	lastError?: string;
	expiryTime?: number;
	expectedWorstCaseGasPrice?: `0x${string}`;
};

export type ExecutionResponse = PendingExecutionStored & {
	slotAlreadyUsed?: boolean;
};

export interface ExecutorStorage {
	getPendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
		batchIndex: number;
	}): Promise<PendingExecutionStored | undefined>;

	getPendingExecutionBatch(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<PendingExecutionStored[] | undefined>;

	deletePendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
		batchIndex: number;
	}): Promise<void>;
	createOrUpdatePendingExecution(
		executionToStore: PendingExecutionStored,
		asPaymentFor?: {
			chainId: `0x${string}`;
			account: `0x${string}`;
			slot: string;
			batchIndex: number;
			upToGasPrice: bigint;
		},
	): Promise<PendingExecutionStored>;
	getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]>;
	getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: `0x${string}`;
			broadcaster: `0x${string}`;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored[]>;

	getAllExecutions(params: {limit: number}): Promise<PendingExecutionStored[]>;

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

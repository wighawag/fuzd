import {EIP1193Account, EIP1193DATA, EIP1193QUANTITY} from 'eip-1193';
import {ExpectedWorstCaseGasPrice, EIP1193TransactionDataUsed} from 'fuzd-common';

export type BroadcasterData = {
	chainId: `0x${string}`;
	nextNonce: number;
	address: EIP1193Account;
};

export type PendingExecutionStored = {
	chainId: `0x${string}`;
	account: EIP1193Account;
	slot: string;
	broadcasterAssignerID: string;
	transaction: EIP1193TransactionDataUsed;
	initialTime: number;
	broadcastTime?: number;
	nextCheckTime: number;
	hash: EIP1193DATA;
	maxFeePerGasAuthorized: EIP1193QUANTITY;
	isVoidTransaction: boolean;
	finalized: boolean;
	retries?: number;
	lastError?: string;
	expiryTime?: number;
	expectedWorstCaseGasPrice?: string;
};

export interface ExecutorStorage {
	getPendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<PendingExecutionStored | undefined>;

	deletePendingExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void>;
	createOrUpdatePendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored>;
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

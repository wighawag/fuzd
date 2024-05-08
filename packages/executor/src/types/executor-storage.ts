import {EIP1193Account, EIP1193DATA, EIP1193TransactionDataOfType2} from 'eip-1193';
import {RequiredKeys} from './utils';
import {BroadcastSchedule} from './executor';

// export type EIP1193TransactionDataUsed =
// 	| RequiredKeys<EIP1193LegacyTransactionData, 'nonce' | 'gasPrice'>
// 	| RequiredKeys<EIP1193TransactionDataOfType1, 'nonce' | 'gasPrice'>
// 	| RequiredKeys<EIP1193TransactionDataOfType2, 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>;
export type EIP1193TransactionDataUsed = RequiredKeys<
	EIP1193TransactionDataOfType2,
	'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gas' | 'chainId' | 'from' | 'type'
>;

export type EIP1193TransactionToFill = Omit<
	EIP1193TransactionDataUsed,
	'nonce' | 'from' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
>;

export type BroadcasterData = {
	chainId: `0x${string}`;
	nextNonce: number;
	address: EIP1193Account;
};

export type PendingExecutionStored = EIP1193TransactionDataUsed & {
	slot: string;
	broadcasterAssignerID: string;
	initialTime: number;
	broadcastTime?: number;
	nextCheckTime: number;
	hash: EIP1193DATA;
	account: EIP1193Account;
	broadcastSchedule: BroadcastSchedule;
	isVoidTransaction: boolean;
	retries?: number;
	lastError?: string;
	expiryTime?: number;
};

export interface ExecutorStorage {
	getPendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<PendingExecutionStored | undefined>;

	deletePendingExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void>;
	archiveTimedoutExecution(params: PendingExecutionStored): Promise<void>;
	getArchivedExecutions(params: {limit: number}): Promise<PendingExecutionStored[]>;
	createOrUpdatePendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored>;
	getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]>;
	getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: `0x${string}`;
			broadcaster: `0x${string}`;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored[]>;

	// TODO remove: createBroadcaster is not used, and if used we should use updateBroadcaster too
	getBroadcaster(params: {chainId: `0x${string}`; address: string}): Promise<BroadcasterData | undefined>;
	createBroadcaster(broadcaster: BroadcasterData): Promise<void>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}

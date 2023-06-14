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
	nextNonce: number;
	address: EIP1193Account;
};

export type PendingExecutionStored = EIP1193TransactionDataUsed & {
	id: string;
	broadcastTime: number;
	hash: EIP1193DATA;
	account: EIP1193Account;
	broadcastSchedule: BroadcastSchedule;
	retries?: number;
};

export interface ExecutorStorage {
	// getPendingExecutionByID(params: {id: string}): Promise<PendingExecutionStored | undefined>;
	// getPendingExecutionByBroadcast(params: {
	// 	nonce: `0x${string}`;
	// 	from: `0x${string}`;
	// }): Promise<PendingExecutionStored | undefined>;

	deletePendingExecution(params: {id: string; broadcastTime: number}): Promise<void>;
	createPendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored>;
	updatePendingExecution(data: PendingExecutionStored): Promise<void>;
	getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]>;

	getBroadcaster(params: {address: string}): Promise<BroadcasterData | undefined>;
	createBroadcaster(broadcaster: BroadcasterData): Promise<void>;
}

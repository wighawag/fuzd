import {EIP1193Account} from 'eip-1193';
import {AssumedTransaction, FixedTiming, ScheduledExecution, StartTransaction, TimingTypes} from './external';

export type ExecutionQueued<TransactionDataType> = ScheduledExecution<
	TransactionDataType,
	TimingTypes,
	FixedTiming,
	StartTransaction & {confirmed?: {blockTime: number; startTime?: number}},
	AssumedTransaction & {confirmed?: {blockTime: number}}
> & {
	slot: string;
	account: EIP1193Account;
	checkinTime: number;
	retries: number;
};

export interface SchedulerStorage<TransactionDataType> {
	getQueuedExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<ExecutionQueued<TransactionDataType> | undefined>;
	getQueuedExecutionsForAccount(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
	}): Promise<ExecutionQueued<TransactionDataType>[]>;
	deleteExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void>;
	createOrUpdateQueuedExecution(
		executionToStore: ExecutionQueued<TransactionDataType>,
	): Promise<ExecutionQueued<TransactionDataType>>;
	getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}

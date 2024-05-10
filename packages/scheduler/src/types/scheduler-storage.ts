import {EIP1193Account} from 'eip-1193';
import {ScheduledExecution} from './external';

export type ExecutionQueued<TransactionDataType> = ScheduledExecution<TransactionDataType> & {
	slot: string;
	account: EIP1193Account;
	broadcasted: boolean;
	checkinTime: number;
	retries: number;
	priorTransactionConfirmation?: {
		blockTime: number;
		startTime?: number;
	};
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
	archiveExecution(executionToStore: ExecutionQueued<TransactionDataType>): Promise<void>;
	createOrUpdateQueuedExecution(
		executionToStore: ExecutionQueued<TransactionDataType>,
	): Promise<ExecutionQueued<TransactionDataType>>;
	getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}

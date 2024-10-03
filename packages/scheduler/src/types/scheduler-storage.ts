import {ExecutionSubmission} from 'fuzd-common';
import {ScheduledExecution} from './external';

export type ScheduledExecutionQueued<TransactionDataType> = ScheduledExecution<
	ExecutionSubmission<TransactionDataType>
> & {
	slot: string;
	account: `0x${string}`;
	broadcasted: boolean;
	finalized: boolean;
	checkinTime: number;
	retries: number;
	priorTransactionConfirmation?: {
		blockTime: number;
		startTime?: number;
	};
	expectedWorstCaseGasPrice?: string; // TODO Resources object
};

export interface SchedulerStorage<TransactionDataType> {
	getQueuedExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<ScheduledExecutionQueued<TransactionDataType> | undefined>;
	getQueuedExecutionsForAccount(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	deleteExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void>;
	archiveExecution(executionToStore: ScheduledExecutionQueued<TransactionDataType>): Promise<void>;
	createOrUpdateQueuedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
	): Promise<ScheduledExecutionQueued<TransactionDataType>>;
	getQueueTopMostExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getUnFinalizedBroadcastedScheduledExecutions(params: {
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getUnFinalizedScheduledExecutionsPerAccount(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAllExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAccountSubmissions(
		account: `0x${string}`,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAccountArchivedSubmissions(
		account: `0x${string}`,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}

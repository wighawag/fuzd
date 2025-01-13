import {ExecutionSubmission, IntegerString, String0x} from 'fuzd-common';
import {ScheduledExecution} from './external.js';

export type ScheduledExecutionQueued<TransactionDataType> = ScheduledExecution<
	ExecutionSubmission<TransactionDataType>
> & {
	slot: string;
	account: String0x;
	broadcasted: boolean;
	finalized: boolean;
	checkinTime: number;
	retries: number;
	priorTransactionConfirmation?: {
		blockTime: number;
		startTime?: number;
	};
};

export interface SchedulerStorage<TransactionDataType> {
	getQueuedExecution(params: {
		chainId: IntegerString;
		account: String0x;
		slot: string;
	}): Promise<ScheduledExecutionQueued<TransactionDataType> | undefined>;
	getQueuedExecutionsForAccount(params: {
		chainId: IntegerString;
		account: String0x;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	deleteExecution(params: {chainId: IntegerString; account: String0x; slot: string}): Promise<void>;
	archiveExecution(executionToStore: ScheduledExecutionQueued<TransactionDataType>): Promise<void>;
	createOrUpdateQueuedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
	): Promise<ScheduledExecutionQueued<TransactionDataType>>;
	getQueueTopMostExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getUnFinalizedBroadcastedScheduledExecutions(params: {
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getUnFinalizedScheduledExecutionsPerBroadcaster(params: {
		chainId: IntegerString;
		broadcaster: String0x;
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAllExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAccountSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAccountArchivedSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}

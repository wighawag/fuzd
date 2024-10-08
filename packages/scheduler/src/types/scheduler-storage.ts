import {ScheduledExecution} from './external';

export type ScheduledExecutionQueued<ExecutionDataType> = ScheduledExecution<ExecutionDataType> & {
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

export interface SchedulerStorage<ExecutionDataType> {
	getQueuedExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<ScheduledExecutionQueued<ExecutionDataType> | undefined>;
	getQueuedExecutionsForAccount(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
	}): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	deleteExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void>;
	archiveExecution(executionToStore: ScheduledExecutionQueued<ExecutionDataType>): Promise<void>;
	createOrUpdateQueuedExecution(
		executionToStore: ScheduledExecutionQueued<ExecutionDataType>,
	): Promise<ScheduledExecutionQueued<ExecutionDataType>>;
	getQueueTopMostExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	getUnFinalizedBroadcastedScheduledExecutions(params: {
		limit: number;
	}): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	getUnFinalizedScheduledExecutionsPerAccount(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		limit: number;
	}): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	getAllExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	getAccountSubmissions(
		account: `0x${string}`,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	getAccountArchivedSubmissions(
		account: `0x${string}`,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<ExecutionDataType>[]>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}

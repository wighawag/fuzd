import {EIP1193Account} from 'eip-1193';
import {AssumedTransaction, FixedTiming, ScheduledExecution, StartTransaction, TimingTypes} from './scheduler';

export type ExecutionQueued<TransactionDataType> = ScheduledExecution<
	TransactionDataType,
	TimingTypes,
	FixedTiming,
	StartTransaction & {confirmed?: {blockTime: number; startTime?: number}},
	AssumedTransaction & {confirmed?: {blockTime: number}}
> & {
	id: string;
	account: EIP1193Account;
	checkinTime: number;
	retries: number;
};

export interface SchedulerStorage<TransactionDataType> {
	getQueuedExecution(params: {
		chainId: `0x${string}`;
		id: string;
		checkinTime: number;
		timeContract?: `0x${string}`;
	}): Promise<ExecutionQueued<TransactionDataType> | undefined>;
	deleteExecution(params: {
		chainId: `0x${string}`;
		id: string;
		checkinTime: number;
		timeContract?: `0x${string}`;
	}): Promise<void>;
	queueExecution(executionToStore: ExecutionQueued<TransactionDataType>): Promise<ExecutionQueued<TransactionDataType>>;
	updateExecutionInQueue(executionUpdated: ExecutionQueued<TransactionDataType>): Promise<void>;
	reassignExecutionInQueue(oldCheckinTime: number, execution: ExecutionQueued<TransactionDataType>): Promise<void>;
	getQueueTopMostExecutions(
		params: {limit: number},
		onlyWithTimeContract?: {chainId: `0x${string}`; timeContract: `0x${string}`}
	): Promise<ExecutionQueued<TransactionDataType>[]>;
}

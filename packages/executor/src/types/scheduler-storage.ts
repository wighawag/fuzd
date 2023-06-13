import {EIP1193Account} from 'eip-1193';
import {AssumedTransaction, DeltaExecution, Execution, FixedTimeExecution, StartTransaction} from './scheduler';

export type ExecutionQueued = Execution & {
	id: string;
	account: EIP1193Account;
	executionTime: number;
	retries: number;
	timing:
		| FixedTimeExecution<AssumedTransaction & {confirmed?: {blockTime: number}}>
		| DeltaExecution<StartTransaction & {confirmed?: {blockTime: number; startTime?: number}}>;
};

export interface SchedulerStorage {
	getQueuedExecution(params: {id: string; executionTime: number}): Promise<ExecutionQueued | undefined>;
	deleteExecution(params: {id: string; executionTime: number}): Promise<void>;
	queueExecution(executionToStore: ExecutionQueued): Promise<ExecutionQueued>;
	updateExecutionInQueue(executionUpdated: ExecutionQueued): Promise<void>;
	reassignExecutionInQueue(oldExecutionTime: number, execution: ExecutionQueued): Promise<void>;
	getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued[]>;
}

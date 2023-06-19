import {KeyValueDB} from 'atomikv';
import type {ExecutionQueued, SchedulerStorage} from 'fuzd-scheduler';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeQueueID(chainId: `0x${string}`, checkinTime: number, id: string): string {
	return `q_${chainId}_${lexicographicNumber(checkinTime, 12)}_${id}`;
}

export class KVSchedulerStorage<TransactionDataType> implements SchedulerStorage<TransactionDataType> {
	constructor(private db: KeyValueDB) {}

	getQueuedExecution(params: {
		id: string;
		checkinTime: number;
	}): Promise<ExecutionQueued<TransactionDataType> | undefined> {
		return this.db.get<ExecutionQueued<TransactionDataType>>(computeQueueID(params.checkinTime, params.id));
	}
	async deleteExecution(params: {id: string; checkinTime: number}): Promise<void> {
		await this.db.delete(computeQueueID(params.checkinTime, params.id));
	}
	async queueExecution(
		executionToStore: ExecutionQueued<TransactionDataType>
	): Promise<ExecutionQueued<TransactionDataType>> {
		await this.db.put<ExecutionQueued<TransactionDataType>>(
			computeQueueID(executionToStore.checkinTime, executionToStore.id),
			executionToStore
		);
		return executionToStore;
	}
	async updateExecutionInQueue(executionUpdated: ExecutionQueued<TransactionDataType>): Promise<void> {
		await this.db.put(computeQueueID(executionUpdated.checkinTime, executionUpdated.id), executionUpdated);
	}
	async reassignExecutionInQueue(
		oldExecutionTime: number,
		execution: ExecutionQueued<TransactionDataType>
	): Promise<void> {
		await this.db.transaction(async (txn) => {
			await txn.delete(computeQueueID(oldExecutionTime, execution.id));
			await txn.put<ExecutionQueued<TransactionDataType>>(
				computeQueueID(execution.checkinTime, execution.id),
				execution
			);
		});
	}
	async getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const map = await this.db.list<ExecutionQueued<TransactionDataType>>({prefix: 'q_', limit: params.limit});
		const values: ExecutionQueued<TransactionDataType>[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}
}

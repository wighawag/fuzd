import {KeyValueDB} from 'atomikv';
import type {ExecutionQueued, SchedulerStorage} from 'dreveal-executor';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeQueueID(executionTime: number, id: string): string {
	return `q_${lexicographicNumber(executionTime, 12)}_${id}`;
}

export class initKVStorage implements SchedulerStorage {
	constructor(private db: KeyValueDB) {}

	getQueuedExecution(params: {id: string; executionTime: number}): Promise<ExecutionQueued | undefined> {
		return this.db.get<ExecutionQueued>(computeQueueID(params.executionTime, params.id));
	}
	async deleteExecution(params: {id: string; executionTime: number}): Promise<void> {
		await this.db.delete(computeQueueID(params.executionTime, params.id));
	}
	async queueExecution(executionToStore: ExecutionQueued): Promise<ExecutionQueued> {
		await this.db.put<ExecutionQueued>(
			computeQueueID(executionToStore.executionTime, executionToStore.id),
			executionToStore
		);
		return executionToStore;
	}
	async updateExecutionInQueue(executionUpdated: ExecutionQueued): Promise<void> {
		await this.db.put(computeQueueID(executionUpdated.executionTime, executionUpdated.id), executionUpdated);
	}
	async reassignExecutionInQueue(oldExecutionTime: number, execution: ExecutionQueued): Promise<void> {
		this.db.delete(computeQueueID(oldExecutionTime, execution.id));
		await this.db.put<ExecutionQueued>(computeQueueID(execution.executionTime, execution.id), execution);
	}
	async getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued[]> {
		const map = await this.db.list<ExecutionQueued>({prefix: 'q_', limit: params.limit});
		const values: ExecutionQueued[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}
}

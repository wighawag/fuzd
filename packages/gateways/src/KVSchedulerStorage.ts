import {KeyValueDB} from 'atomikv';
import type {ExecutionQueued, SchedulerStorage} from 'fuzd-scheduler';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeQueueID(checkinTime: number, chainId: `0x${string}`, id: string): string {
	const prefix = 'q__';
	const suffix = `${lexicographicNumber(checkinTime, 12)}_${chainId}_${id}`;
	return `${prefix}${suffix}`;
}

export class KVSchedulerStorage<TransactionDataType> implements SchedulerStorage<TransactionDataType> {
	constructor(private db: KeyValueDB) {}

	getQueuedExecution(params: {
		chainId: `0x${string}`;
		id: string;
		checkinTime: number;
	}): Promise<ExecutionQueued<TransactionDataType> | undefined> {
		return this.db.get<ExecutionQueued<TransactionDataType>>(
			computeQueueID(params.checkinTime, params.chainId, params.id),
		);
	}
	async deleteExecution(params: {chainId: `0x${string}`; id: string; checkinTime: number}): Promise<void> {
		await this.db.delete(computeQueueID(params.checkinTime, params.chainId, params.id));
	}
	async queueExecution(
		executionToStore: ExecutionQueued<TransactionDataType>,
	): Promise<ExecutionQueued<TransactionDataType>> {
		await this.db.put<ExecutionQueued<TransactionDataType>>(
			computeQueueID(executionToStore.checkinTime, executionToStore.chainId, executionToStore.id),
			executionToStore,
		);
		return executionToStore;
	}
	async updateExecutionInQueue(executionUpdated: ExecutionQueued<TransactionDataType>): Promise<void> {
		await this.db.put(
			computeQueueID(executionUpdated.checkinTime, executionUpdated.chainId, executionUpdated.id),
			executionUpdated,
		);
	}
	async reassignExecutionInQueue(
		oldExecutionTime: number,
		execution: ExecutionQueued<TransactionDataType>,
	): Promise<void> {
		await this.db.transaction(async (txn) => {
			await txn.delete(computeQueueID(oldExecutionTime, execution.chainId, execution.id));
			await txn.put<ExecutionQueued<TransactionDataType>>(
				computeQueueID(execution.checkinTime, execution.chainId, execution.id),
				execution,
			);
		});
	}
	async getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const prefix = 'q__';
		const map = await this.db.list<ExecutionQueued<TransactionDataType>>({prefix, limit: params.limit});
		const values: ExecutionQueued<TransactionDataType>[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}
}

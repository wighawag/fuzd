import {KeyValueDB} from 'atomikv';
import type {ExecutionQueued, SchedulerStorage} from 'fuzd-scheduler';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeQueueID(checkinTime: number, chainId: `0x${string}`, account: `0x${string}`, slot: string): string {
	const prefix = 'q__';
	const suffix = `${lexicographicNumber(checkinTime, 12)}_${chainId}_${account.toLowerCase()}_${slot}`;
	return `${prefix}${suffix}`;
}

function computeExecutionID(chainId: `0x${string}`, account: `0x${string}`, slot: string) {
	return `execution_${chainId}_${account.toLowerCase()}_${slot}`;
}

type IndexID = {dbID: string};

export class KVSchedulerStorage<TransactionDataType> implements SchedulerStorage<TransactionDataType> {
	constructor(private db: KeyValueDB) {}

	getQueuedExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<ExecutionQueued<TransactionDataType> | undefined> {
		return this.db.get<ExecutionQueued<TransactionDataType>>(
			computeExecutionID(params.chainId, params.account, params.slot),
		);
	}
	async getQueuedExecutionsForAccount(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		limit: number;
	}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const prefix = `execution_${params.chainId}_${params.account.toLowerCase()}_`;
		const map = await this.db.list<ExecutionQueued<TransactionDataType>>({prefix, limit: params.limit});
		const values: ExecutionQueued<TransactionDataType>[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}

	async deleteExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void> {
		const dbID = computeExecutionID(params.chainId, params.account, params.slot);
		await this.db.transaction(async (txn) => {
			const oldExecution = await txn.get<ExecutionQueued<TransactionDataType>>(dbID);
			if (oldExecution) {
				await txn.delete(dbID);
				await txn.delete(
					computeQueueID(oldExecution.checkinTime, oldExecution.chainId, oldExecution.account, oldExecution.slot),
				);
			}
		});
	}

	async createOrUpdateQueuedExecution(
		executionToStore: ExecutionQueued<TransactionDataType>,
	): Promise<ExecutionQueued<TransactionDataType>> {
		// we compute the dbID, it never change and contains the actual data
		const dbID = computeExecutionID(executionToStore.chainId, executionToStore.account, executionToStore.slot);
		await this.db.transaction(async (txn) => {
			const oldExecution = await txn.get<ExecutionQueued<TransactionDataType>>(dbID);
			if (oldExecution) {
				// if we happen to already have an execution stored
				// we delete its index in the queue
				await txn.delete(
					computeQueueID(oldExecution.checkinTime, oldExecution.chainId, oldExecution.account, oldExecution.slot),
				);
			}
			// we then write/update the actuall data
			await txn.put<ExecutionQueued<TransactionDataType>>(dbID, executionToStore);
			// we then queue it in the checkinTime ordered list, our index
			await this.db.put<IndexID>(
				computeQueueID(
					executionToStore.checkinTime,
					executionToStore.chainId,
					executionToStore.account,
					executionToStore.slot,
				),
				{
					dbID: dbID,
				},
			);
		});

		return executionToStore;
	}

	protected async _getQueuedExecutions(keys: string[]): Promise<ExecutionQueued<TransactionDataType>[]> {
		const map = await this.db.get<ExecutionQueued<TransactionDataType>>(keys);
		const values: ExecutionQueued<TransactionDataType>[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}

	async getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const prefix = 'q__';
		// we get the keys from the index
		const mapOfIndex = await this.db.list<IndexID>({prefix, limit: params.limit});
		const keys: string[] = [];
		for (const value of mapOfIndex.values()) {
			keys.push(value.dbID);
		}
		// we then fetch the items
		return this._getQueuedExecutions(keys);
	}
}

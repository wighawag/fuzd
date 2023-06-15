import {KeyValueDB} from 'atomikv';
import type {ExecutorStorage, PendingExecutionStored, BroadcasterData} from 'dreveal-executor';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeNextCheckID(broadcastTime: number, id: string): string {
	return `checkin_${lexicographicNumber(broadcastTime, 12)}_${id}`;
}

function computeExecutionID(id: string) {
	return `tx_${id}`;
}

type IndexID = {dbID: string};

export class KVExecutorStorage implements ExecutorStorage {
	constructor(private db: KeyValueDB) {}

	async getPendingExecution(params: {id: string}): Promise<PendingExecutionStored | undefined> {
		return this.db.get<PendingExecutionStored>(computeExecutionID(params.id));
	}

	async deletePendingExecution(params: {id: string}): Promise<void> {
		await this.db.transaction(async (txn) => {
			const execution = await this.db.get<PendingExecutionStored>(computeExecutionID(params.id));
			if (execution) {
				await txn.delete(computeExecutionID(params.id));
				await txn.delete(computeNextCheckID(execution.nextCheckTime, params.id));
			}
		});
	}
	async createOrUpdatePendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored> {
		const dbID = computeExecutionID(executionToStore.id);
		await this.db.transaction(async (txn) => {
			const oldExecution = await txn.get<PendingExecutionStored>(dbID);
			if (oldExecution) {
				await txn.delete(computeNextCheckID(oldExecution.nextCheckTime, oldExecution.id));
			}
			await txn.put<PendingExecutionStored>(dbID, executionToStore);
			await txn.put<IndexID>(computeNextCheckID(executionToStore.nextCheckTime, executionToStore.id), {
				dbID: dbID,
			});
		});
		return executionToStore;
	}

	async getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]> {
		// we get the keys from the index
		const mapOfIndex = await this.db.list<IndexID>({prefix: `checkin_`, limit: params.limit});
		const keys: string[] = [];
		for (const value of mapOfIndex.values()) {
			keys.push(value.dbID);
		}
		// we then fetch the items
		const map = await this.db.get<PendingExecutionStored>(keys);
		const values: PendingExecutionStored[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}

	getBroadcaster(params: {address: string}): Promise<BroadcasterData | undefined> {
		const broadcasterID = `broadcaster_${params.address}`;
		return this.db.get<BroadcasterData>(broadcasterID);
	}
	async createBroadcaster(broadcaster: BroadcasterData): Promise<void> {
		const broadcasterID = `broadcaster_${broadcaster.address}`;
		return this.db.put<BroadcasterData>(broadcasterID, broadcaster);
	}
}

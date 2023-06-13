import {KeyValueDB} from 'atomikv';
import type {ExecutorStorage, PendingExecutionStored, BroadcasterData} from 'dreveal-executor';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computePendingID(broadcastTime: number, id: string): string {
	return `pending_${lexicographicNumber(broadcastTime, 12)}_${id}`;
}

function computePendingIndex(id: string) {
	return `_index_pending_id_${id}`;
}

type IndexID = {dbID: string};

export class KVExecutorStorage implements ExecutorStorage {
	constructor(private db: KeyValueDB) {}

	async getPendingExecutionByID(params: {id: string}): Promise<PendingExecutionStored | undefined> {
		const fromDB = await this.db.get<IndexID>(computePendingIndex(params.id));
		if (fromDB) {
			return this.db.get<PendingExecutionStored>(fromDB.dbID);
		}
	}

	async deletePendingExecution(params: {id: string; broadcastTime: number}): Promise<void> {
		this.db.delete(computePendingIndex(params.id));
		await this.db.delete(computePendingID(params.broadcastTime, params.id));
	}
	async createPendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored> {
		const pendingID = computePendingID(executionToStore.broadcastTime, executionToStore.id);
		this.db.put<IndexID>(computePendingIndex(executionToStore.id), {dbID: pendingID});
		await this.db.put<PendingExecutionStored>(pendingID, executionToStore);
		return executionToStore;
	}
	async updatePendingExecution(udpated: PendingExecutionStored): Promise<void> {
		// this assume broadcastTime and id do not change
		await this.db.put(computePendingID(udpated.broadcastTime, udpated.id), udpated);
	}
	async getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]> {
		const map = await this.db.list<PendingExecutionStored>({prefix: `pending_`, limit: params.limit});
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

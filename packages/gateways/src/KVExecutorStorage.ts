import {KeyValueDB} from 'atomikv';
import type {ExecutorStorage, PendingExecutionStored, BroadcasterData} from 'fuzd-executor';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeNextCheckID(broadcastTime: number, chainId: `0x${string}`, id: string): string {
	return `checkin_${lexicographicNumber(broadcastTime, 12)}_${chainId}_${id}`;
}

function computePerAccountID(broadcaster: `0x${string}`, chainId: `0x${string}`, nonce: number): string {
	return `broadcaster_tx_${broadcaster}_${chainId}_${lexicographicNumber(nonce, 12)}`;
}

function computeExecutionID(chainId: `0x${string}`, id: string) {
	return `tx_${chainId}_${id}`;
}

type IndexID = {dbID: string};

export class KVExecutorStorage implements ExecutorStorage {
	constructor(private db: KeyValueDB) {}

	async getPendingExecution(params: {chainId: `0x${string}`; id: string}): Promise<PendingExecutionStored | undefined> {
		return this.db.get<PendingExecutionStored>(computeExecutionID(params.chainId, params.id));
	}

	async deletePendingExecution(params: {chainId: `0x${string}`; id: string; nonce: `0x${string}`}): Promise<void> {
		await this.db.transaction(async (txn) => {
			const execution = await this.db.get<PendingExecutionStored>(computeExecutionID(params.chainId, params.id));
			if (execution) {
				await txn.delete(computeExecutionID(params.chainId, params.id));
				await txn.delete(computeNextCheckID(execution.nextCheckTime, params.chainId, params.id));
				const nonce = parseInt(params.nonce.slice(2), 16);
				await txn.delete(computePerAccountID(execution.from, params.chainId, nonce));
			}
		});
	}
	async createOrUpdatePendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored> {
		const dbID = computeExecutionID(executionToStore.chainId, executionToStore.id);
		await this.db.transaction(async (txn) => {
			const oldExecution = await txn.get<PendingExecutionStored>(dbID);
			if (oldExecution) {
				await txn.delete(computeNextCheckID(oldExecution.nextCheckTime, oldExecution.chainId, oldExecution.id));
			}
			await txn.put<PendingExecutionStored>(dbID, executionToStore);
			await txn.put<IndexID>(
				computeNextCheckID(executionToStore.nextCheckTime, executionToStore.chainId, executionToStore.id),
				{
					dbID: dbID,
				}
			);
			const nonce = parseInt(executionToStore.nonce.slice(2), 16);
			await txn.put<IndexID>(computePerAccountID(executionToStore.from, executionToStore.chainId, nonce), {
				dbID: dbID,
			});
		});
		return executionToStore;
	}

	protected async _getPendingExecutions(keys: string[]): Promise<PendingExecutionStored[]> {
		const map = await this.db.get<PendingExecutionStored>(keys);
		const values: PendingExecutionStored[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}

	async getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]> {
		// we get the keys from the index
		const mapOfIndex = await this.db.list<IndexID>({prefix: `checkin_`, limit: params.limit});
		const keys: string[] = [];
		for (const value of mapOfIndex.values()) {
			keys.push(value.dbID);
		}
		// we then fetch the items
		return this._getPendingExecutions(keys);
	}

	// TODO use this to update teh tx
	async getPendingExecutionsPerBroadcaster(params: {
		chainId: `0x${string}`;
		broadcaster: `0x${string}`;
		limit: number;
	}): Promise<PendingExecutionStored[]> {
		// we get the keys from the index
		const mapOfIndex = await this.db.list<IndexID>({
			prefix: `broadcaster_tx_${params.broadcaster}_${params.chainId}_`,
			limit: params.limit,
		});
		const keys: string[] = [];
		for (const value of mapOfIndex.values()) {
			keys.push(value.dbID);
		}
		// we then fetch the items
		return this._getPendingExecutions(keys);
	}

	getBroadcaster(params: {chainId: `0x${string}`; address: string}): Promise<BroadcasterData | undefined> {
		const broadcasterID = `broadcaster_${params.address}_${params.chainId}`;
		return this.db.get<BroadcasterData>(broadcasterID);
	}
	async createBroadcaster(broadcaster: BroadcasterData): Promise<void> {
		const broadcasterID = `broadcaster_${broadcaster.address}_${broadcaster.chainId}`;
		return this.db.put<BroadcasterData>(broadcasterID, broadcaster);
	}
}

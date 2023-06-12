import {KeyValueDB} from 'atomikv';
import {
	ExecutorStorage,
	ExecutionStored,
	ExecutionBroadcastStored,
	Broadcaster,
	ExecutionPendingTransactionData,
} from 'dreveal-executor';

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeQueueID(executionTime: number, id: string): string {
	return `q_${lexicographicNumber(executionTime, 12)}_${id}`;
}

function computeBroadcastID(id: string): string {
	return `b_${id}`;
}

function computePendingID(broadcaster: `0x${string}`, nonce: number): string {
	return `pending_${broadcaster}_${lexicographicNumber(nonce, 12)}`;
}

export class initKVStorage implements ExecutorStorage {
	constructor(private db: KeyValueDB) {}

	getExecution(id: string, executionTime: number): Promise<ExecutionStored | undefined> {
		return this.db.get<ExecutionStored>(computeQueueID(executionTime, id));
	}
	getBroadcastedExecution(id: string): Promise<ExecutionBroadcastStored | undefined> {
		return this.db.get<ExecutionBroadcastStored>(computeBroadcastID(id));
	}

	async deleteExecution(id: string, executionTime: number): Promise<void> {
		this.db.delete(computeQueueID(executionTime, id));
		await this.db.delete(computeBroadcastID(id));
	}
	// expect to delete atomically both broadast and queue

	async deletePendingExecution(id: string, broadcaster: `0x${string}`, nonce: number): Promise<void> {
		this.db.delete(computePendingID(broadcaster, nonce));
		await this.db.delete(id);
	}

	async createExecution(
		id: string,
		executionTime: number,
		executionToStore: ExecutionStored
	): Promise<ExecutionStored> {
		// db.put<AccountData>(accountID, accountRefected);
		// TODO callback for account ?
		this.db.put<ExecutionStored>(computeQueueID(executionTime, id), executionToStore);
		await this.db.put<ExecutionBroadcastStored>(id, {executionTime});
		return executionToStore;
	}

	async updateExecutionInQueue(executionTime: number, executionUpdated: ExecutionStored): Promise<void> {
		await this.db.put(computeQueueID(executionTime, executionUpdated.id), executionUpdated);
	}

	async reassignExecutionToQueue(
		oldExecutionTime: number,
		newExecutionTime: number,
		execution: ExecutionStored
	): Promise<void> {
		this.db.delete(computeQueueID(oldExecutionTime, execution.id));
		await this.db.put<ExecutionStored>(computeQueueID(newExecutionTime, execution.id), execution);
	}
	// db.delete(queueID);
	// db.put<ExecutionStored>(computeQueueID(newTimestamp, execution.id), execution);

	getBroadcaster(address: string): Promise<Broadcaster | undefined> {
		const broadcasterID = `broadcaster_${address}`;
		return this.db.get<Broadcaster>(broadcasterID);
	}
	async getBroadcasterFor(address: string): Promise<Broadcaster | undefined> {
		return undefined;
	}

	createBroadcaster(address: string, broadcaster: Broadcaster): Promise<void> {
		const broadcasterID = `broadcaster_${address}`;
		return this.db.put<Broadcaster>(broadcasterID, broadcaster);
	}

	async createPendingExecution(
		id: string,
		executionTime: number,
		nonce: number,
		data: ExecutionPendingTransactionData,
		broadcasterAddress: string,
		broadcaster: Broadcaster
	): Promise<ExecutionPendingTransactionData> {
		const pendingID = computePendingID(broadcaster.address, broadcaster.nextNonce);

		this.db.put<ExecutionBroadcastStored>(id, {nonce}); // no queueID
		this.db.put<ExecutionPendingTransactionData>(pendingID, data);

		const broadcasterID = `broadcaster_${broadcasterAddress}`;
		this.db.put<Broadcaster>(broadcasterID, broadcaster);
		await this.db.delete(computeQueueID(executionTime, data.id));
		return data;
	}
	// db.put<ExecutionBroadcastStored>(broadcastID, {pendingID}); // no queueID
	// db.put<ExecutionPendingTransactionData>(pendingID, {
	//     ...execution,
	//     broadcastedTransaction: {info: result.tx, data: {...transaction, nonce: `0x${result.tx.nonce.toString()}`}},
	// });
	// broadcaster.nextNonce = result.tx.nonce + 1;
	// await db.put<Broadcaster>(broadcasterID, broadcaster);
	// await db.delete(queueID);

	async getQueueTopMostExecutions(limit: number): Promise<ExecutionStored[]> {
		const map = await this.db.list<ExecutionStored>({prefix: 'q_', limit});
		const values: ExecutionStored[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}
	// const executions = await db.list<ExecutionStored>({prefix: 'q_', limit});

	async updatePendingExecution(pendingID: string, data: ExecutionPendingTransactionData): Promise<void> {
		await this.db.put(pendingID, data);
	}

	async getPendingExecutions(limit: number): Promise<ExecutionPendingTransactionData[]> {
		const map = await this.db.list<ExecutionPendingTransactionData>({prefix: `pending_`, limit});
		const values: ExecutionPendingTransactionData[] = [];
		for (const value of map.values()) {
			values.push(value);
		}
		return values;
	}
}

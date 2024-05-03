import type {RemoteSQL} from 'remote-sql';
import type {ExecutorStorage, PendingExecutionStored, BroadcasterData} from 'fuzd-executor';
import {toValues} from './utils';

type BroadcasterInDB = {
	address: `0x${string}`;
	chainId: `0x${string}`;
	nextNonce: number;
};

function fromBroadcasterInDB(inDB: BroadcasterInDB): BroadcasterData {
	return {
		address: inDB.address,
		chainId: inDB.chainId,
		nextNonce: inDB.nextNonce,
	};
}

function toBroadcasterInDB(obj: BroadcasterData): BroadcasterInDB {
	return {
		address: obj.address,
		chainId: obj.chainId,
		nextNonce: obj.nextNonce,
	};
}

type ExecutionInDB = {
	account: `0x${string}`;
	chainId: `0x${string}`;
	slot: string;
	nextCheckTime: number;
	broadcasterAssignerID: string;
	initialTime: number;
	broadcastTime: number | null;
	hash: `0x${string}`;
	broadcastSchedule: string;
	isVoidTransaction: 0 | 1;
	retries: number | null;
	lastError: string | null;
	expiryTime: number | null;
	broadcaster: `0x${string}`;
	nonce: number;
	transaction: string;
};

function fromExecutionInDB(inDB: ExecutionInDB): PendingExecutionStored {
	return {
		slot: inDB.slot,
		broadcasterAssignerID: inDB.broadcasterAssignerID,
		initialTime: inDB.initialTime,
		broadcastTime: inDB.broadcastTime || undefined,
		nextCheckTime: inDB.nextCheckTime,
		hash: inDB.hash,
		account: inDB.account,
		broadcastSchedule: JSON.parse(inDB.broadcastSchedule),
		isVoidTransaction: inDB.isVoidTransaction == 1 ? true : false,
		retries: inDB.retries || undefined,
		lastError: inDB.lastError || undefined,
		expiryTime: inDB.expiryTime || undefined,
		...JSON.parse(inDB.transaction),
	};
}

function toExecutionInDB(obj: PendingExecutionStored): ExecutionInDB {
	return {
		slot: obj.slot,
		broadcasterAssignerID: obj.broadcasterAssignerID,
		initialTime: obj.initialTime,
		broadcastTime: obj.broadcastTime || null,
		nextCheckTime: obj.nextCheckTime,
		hash: obj.hash,
		account: obj.account,
		broadcastSchedule: JSON.stringify(obj.broadcastSchedule),
		isVoidTransaction: obj.isVoidTransaction ? 1 : 0,
		retries: typeof obj.retries === 'undefined' ? null : obj.retries,
		lastError: obj.lastError || null,
		expiryTime: obj.expiryTime || null,
		broadcaster: obj.from,
		nonce: Number(obj.nonce),
		chainId: obj.chainId,
		// TODO make transaction separate in PendingExecutionStored
		transaction: JSON.stringify({
			from: obj.from,
			type: obj.type,
			to: obj.to,
			gas: obj.gas,
			value: obj.value,
			data: obj.data,
			nonce: obj.nonce,
			chainId: obj.chainId,
			accessList: obj.accessList,
			maxFeePerGas: obj.maxFeePerGas,
			maxPriorityFeePerGas: obj.maxPriorityFeePerGas,
		}),
	};
}

export class RemoteSQLExecutorStorage implements ExecutorStorage {
	constructor(private db: RemoteSQL) {}

	async getPendingExecution(params: {
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<PendingExecutionStored | undefined> {
		const statement = this.db.prepare(
			'SELECT * FROM BroadcastedExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;',
		);
		const {account, chainId, slot} = params;
		const {results} = await statement.bind(account, chainId, slot).all<ExecutionInDB>();
		if (results.length === 0) {
			return undefined;
		} else {
			return fromExecutionInDB(results[0]);
		}
	}

	async deletePendingExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void> {
		const statement = this.db.prepare(
			'DELETE FROM BroadcastedExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;',
		);
		const {account, chainId, slot} = params;
		await statement.bind(account, chainId, slot).all();
	}

	async archiveTimedoutExecution(executionToStore: PendingExecutionStored): Promise<void> {
		const {account, chainId, slot} = executionToStore;
		const inDB = toExecutionInDB(executionToStore);
		const {values, columns, bindings} = toValues(inDB);

		const deleteFromExecutions = this.db.prepare(
			'DELETE FROM BroadcastedExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;',
		);
		const insertIntoArchive = this.db.prepare(`INSERT INTO ArchivedExecutions (${columns}) VALUES(${bindings})`);
		await this.db.batch([deleteFromExecutions.bind(account, chainId, slot), insertIntoArchive.bind(...values)]);
	}

	async getArchivedExecutions(params: {limit: number; offset?: number}): Promise<PendingExecutionStored[]> {
		const statement = this.db.prepare(`SELECT * FROM ArchivedExecutions ORDER BY initialTime ASC LIMIT ?1 OFFSET ?2`);
		const {results} = await statement.bind(params.limit, params.offset || 0).all<ExecutionInDB>();
		return results.map(fromExecutionInDB);
	}

	async createOrUpdatePendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored> {
		const inDB = toExecutionInDB(executionToStore);
		const {values, columns, bindings, overwrites} = toValues(inDB);
		const statement = this.db.prepare(
			`INSERT INTO ArchivedExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot) DO UPDATE SET ${overwrites}`,
		);
		await statement.bind(...values).all();
		return executionToStore;
	}

	async getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored[]> {
		const statement = this.db.prepare(`SELECT * FROM BroadcastedExecutions ORDER BY nextCheckTime ASC LIMIT ?1;`);
		const {results} = await statement.bind(params.limit).all<ExecutionInDB>();
		return results.map(fromExecutionInDB);
	}

	// TODO use this to update teh tx
	async getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: `0x${string}`;
			broadcaster: `0x${string}`;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored[]> {
		const statement = this.db.prepare(
			`SELECT * FROM BroadcastedExecutions WHERE broadcaster = ?1 AND chainId = ?2 ORDER BY nonce ASC LIMIT ?3;`,
		);
		const {results} = await statement
			.bind(broadcasterData.broadcaster, broadcasterData.chainId, params.limit)
			.all<ExecutionInDB>();
		return results.map(fromExecutionInDB);
	}

	async getBroadcaster(params: {chainId: `0x${string}`; address: string}): Promise<BroadcasterData | undefined> {
		const statement = this.db.prepare(`SELECT * FROM Broadcasters WHERE address = ?1 AND chainId = ?2;`);
		const {results} = await statement.bind(params.address, params.chainId).all<BroadcasterInDB>();
		if (results.length === 0) {
			return undefined;
		} else {
			return fromBroadcasterInDB(results[0]);
		}
	}
	async createBroadcaster(broadcaster: BroadcasterData): Promise<void> {
		const inDB = toBroadcasterInDB(broadcaster);
		const {values, columns, bindings} = toValues(inDB);
		const statement = this.db.prepare(`INSERT INTO Broadcasters (${columns}) VALUES(${bindings})`);
		await statement.bind(...values).all();
	}
}

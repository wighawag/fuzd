import type {RemoteSQL} from 'remote-sql';
import type {ExecutorStorage, PendingExecutionStored, BroadcasterData, ExpectedGasPrice} from 'fuzd-executor';
import {sqlToStatements, toValues} from './utils';
import {logs} from 'named-logs';
import setupTables from '../schema/ts/executor.sql';

const logger = logs('fuzd-server-executor-storage-sql');

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
	transactionData: string;
};

type ExpectedGasPriceInDB = {
	chainId: `0x${string}`;
	currentExpectedGasPrice: string | null;
	previousExpectedGasPrice: string | null;
	expectedGasPriceUpdate: number | null;
};

function fromExpectedGasPriceInDB(inDb: ExpectedGasPriceInDB): ExpectedGasPrice {
	return {
		previous: inDb.previousExpectedGasPrice ? BigInt(inDb.previousExpectedGasPrice) : undefined,
		current: inDb.currentExpectedGasPrice ? BigInt(inDb.currentExpectedGasPrice) : undefined,
		updateTimestamp: inDb.expectedGasPriceUpdate || undefined,
	} as ExpectedGasPrice;
}

function toExpectedGasPriceInDB(chainId: `0x${string}`, obj: ExpectedGasPrice): ExpectedGasPriceInDB {
	return {
		chainId,
		currentExpectedGasPrice: obj.current?.toString() || null,
		expectedGasPriceUpdate: obj.updateTimestamp || null,
		previousExpectedGasPrice: obj.previous?.toString() || null,
	};
}

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
		...JSON.parse(inDB.transactionData),
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
		transactionData: JSON.stringify({
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
		const insertIntoArchive = this.db.prepare(
			`INSERT INTO ArchivedBroadcastedExecutions (${columns}) VALUES(${bindings})`,
		);
		await this.db.batch([deleteFromExecutions.bind(account, chainId, slot), insertIntoArchive.bind(...values)]);
	}

	async getArchivedBroadcastedExecutions(params: {limit: number; offset?: number}): Promise<PendingExecutionStored[]> {
		const statement = this.db.prepare(
			`SELECT * FROM ArchivedBroadcastedExecutions ORDER BY initialTime ASC LIMIT ?1 OFFSET ?2;`,
		);
		const {results} = await statement.bind(params.limit, params.offset || 0).all<ExecutionInDB>();
		return results.map(fromExecutionInDB);
	}

	async createOrUpdatePendingExecution(executionToStore: PendingExecutionStored): Promise<PendingExecutionStored> {
		const inDB = toExecutionInDB(executionToStore);
		const {values, columns, bindings, overwrites} = toValues(inDB);
		const sqlStatement = `INSERT INTO BroadcastedExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot) DO UPDATE SET ${overwrites};`;
		logger.debug(sqlStatement);
		const statement = this.db.prepare(sqlStatement);
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

	async clear(): Promise<void> {
		const deleteBroadcasters = this.db.prepare(`DELETE FROM Broadcasters;`);
		const deleteArchivedBroadcastedExecutions = this.db.prepare(`DELETE FROM ArchivedBroadcastedExecutions;`);
		const delteBroadcastedExecutions = this.db.prepare(`DELETE FROM BroadcastedExecutions`);
		await this.db.batch([deleteBroadcasters, deleteArchivedBroadcastedExecutions, delteBroadcastedExecutions]);
	}

	async setup(): Promise<void> {
		const statements = sqlToStatements(setupTables);
		await this.db.batch(statements.map((v) => this.db.prepare(v)));
	}

	async getExpectedGasPrice(chainId: `0x${string}`): Promise<ExpectedGasPrice> {
		const statement = this.db.prepare(`SELECT * FROM ChainConfigurations WHERE chainId = ?1;`);
		const {results} = await statement.bind(chainId).all<ExpectedGasPriceInDB>();
		if (results.length === 0) {
			return {previous: undefined, current: undefined, updateTimestamp: undefined};
		} else {
			return fromExpectedGasPriceInDB(results[0]);
		}
	}

	async updateExpectedGasPrice(
		chainId: `0x${string}`,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<ExpectedGasPrice> {
		const sqlStatement = `INSERT INTO ChainConfigurations (chainId, currentExpectedGasPrice, expectedGasPriceUpdate) 
		 VALUES(?1, ?2, ?3) ON CONFLICT(chainId) DO UPDATE SET
		 previousExpectedGasPrice=currentExpectedGasPrice,
		 expectedGasPriceUpdate=excluded.expectedGasPriceUpdate,
		 currentExpectedGasPrice=excluded.currentExpectedGasPrice;`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(chainId, newGasPrice.toString(), timestamp).all();
		return this.getExpectedGasPrice(chainId);
	}
}

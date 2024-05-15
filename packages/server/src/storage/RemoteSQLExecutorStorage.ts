import type {RemoteSQL} from 'remote-sql';
import type {ExecutorStorage, PendingExecutionStored, BroadcasterData} from 'fuzd-executor';
import {sqlToStatements, toValues} from './utils';
import {logs} from 'named-logs';
import setupTables from '../schema/ts/executor.sql';
import {ExpectedWorstCaseGasPrice} from 'fuzd-common';

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
	maxFeePerGasAuthorized: `0x${string}`;
	expectedWorstCaseGasPrice: `0x${string}` | null;
	isVoidTransaction: 0 | 1;
	finalized: 0 | 1;
	retries: number | null;
	lastError: string | null;
	expiryTime: number | null;
	broadcaster: `0x${string}`;
	nonce: number;
	transactionData: string;
};

type ExpectedWorstCaseGasPriceInDB = {
	chainId: `0x${string}`;
	currentExpectedGasPrice: string | null;
	previousExpectedGasPrice: string | null;
	expectedGasPriceUpdate: number | null;
};

function fromExpectedGasPriceInDB(inDb: ExpectedWorstCaseGasPriceInDB): ExpectedWorstCaseGasPrice {
	return {
		previous: inDb.previousExpectedGasPrice ? BigInt(inDb.previousExpectedGasPrice) : undefined,
		current: inDb.currentExpectedGasPrice ? BigInt(inDb.currentExpectedGasPrice) : undefined,
		updateTimestamp: inDb.expectedGasPriceUpdate || undefined,
	} as ExpectedWorstCaseGasPrice;
}

function toExpectedGasPriceInDB(chainId: `0x${string}`, obj: ExpectedWorstCaseGasPrice): ExpectedWorstCaseGasPriceInDB {
	return {
		chainId,
		currentExpectedGasPrice: obj.current?.toString() || null,
		expectedGasPriceUpdate: obj.updateTimestamp || null,
		previousExpectedGasPrice: obj.previous?.toString() || null,
	};
}

function fromExecutionInDB(inDB: ExecutionInDB): PendingExecutionStored {
	return {
		chainId: inDB.chainId,
		account: inDB.account,
		slot: inDB.slot,
		broadcasterAssignerID: inDB.broadcasterAssignerID,
		initialTime: inDB.initialTime,
		broadcastTime: inDB.broadcastTime || undefined,
		nextCheckTime: inDB.nextCheckTime,
		hash: inDB.hash,
		maxFeePerGasAuthorized: inDB.maxFeePerGasAuthorized,
		expectedWorstCaseGasPrice: inDB.expectedWorstCaseGasPrice || undefined,
		isVoidTransaction: inDB.isVoidTransaction == 1 ? true : false,
		retries: inDB.retries || undefined,
		lastError: inDB.lastError || undefined,
		expiryTime: inDB.expiryTime || undefined,
		transaction: JSON.parse(inDB.transactionData),
		finalized: inDB.finalized == 0 ? false : true,
	};
}

function toExecutionInDB(obj: PendingExecutionStored): ExecutionInDB {
	return {
		chainId: obj.chainId,
		account: obj.account,
		slot: obj.slot,
		broadcasterAssignerID: obj.broadcasterAssignerID,
		initialTime: obj.initialTime,
		broadcastTime: obj.broadcastTime || null,
		nextCheckTime: obj.nextCheckTime,
		hash: obj.hash,
		maxFeePerGasAuthorized: obj.maxFeePerGasAuthorized,
		expectedWorstCaseGasPrice: obj.expectedWorstCaseGasPrice || null,
		isVoidTransaction: obj.isVoidTransaction ? 1 : 0,
		retries: typeof obj.retries === 'undefined' ? null : obj.retries,
		lastError: obj.lastError || null,
		expiryTime: obj.expiryTime || null,
		broadcaster: obj.transaction.from,
		nonce: Number(obj.transaction.nonce),
		transactionData: JSON.stringify(obj.transaction),
		finalized: obj.finalized ? 1 : 0,
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
		const statement = this.db.prepare(
			`SELECT * FROM BroadcastedExecutions  WHERE finalized = FALSE  ORDER BY nextCheckTime ASC LIMIT ?1;`,
		);
		const {results} = await statement.bind(params.limit).all<ExecutionInDB>();
		return results.map(fromExecutionInDB);
	}

	async getAllExecutions(params: {limit: number}): Promise<PendingExecutionStored[]> {
		const sqlStatement = `SELECT * FROM BroadcastedExecutions ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
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

	async getExpectedWorstCaseGasPrice(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice> {
		const statement = this.db.prepare(`SELECT * FROM ChainConfigurations WHERE chainId = ?1;`);
		const {results} = await statement.bind(chainId).all<ExpectedWorstCaseGasPriceInDB>();
		if (results.length === 0) {
			return {previous: undefined, current: undefined, updateTimestamp: undefined};
		} else {
			return fromExpectedGasPriceInDB(results[0]);
		}
	}

	async updateExpectedWorstCaseGasPrice(
		chainId: `0x${string}`,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<ExpectedWorstCaseGasPrice> {
		const sqlStatement = `INSERT INTO ChainConfigurations (chainId, currentExpectedGasPrice, expectedGasPriceUpdate) 
		 VALUES(?1, ?2, ?3) ON CONFLICT(chainId) DO UPDATE SET
		 previousExpectedGasPrice=currentExpectedGasPrice,
		 expectedGasPriceUpdate=excluded.expectedGasPriceUpdate,
		 currentExpectedGasPrice=excluded.currentExpectedGasPrice;`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(chainId, newGasPrice.toString(), timestamp).all();
		return this.getExpectedWorstCaseGasPrice(chainId);
	}
}

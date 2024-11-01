import type {RemoteSQL} from 'remote-sql';
import type {ExecutorStorage, BroadcasterData} from 'fuzd-executor';
import {sqlToStatements, toValues} from './utils.js';
import {logs} from 'named-logs';
import setupTables from '../schema/ts/executor.sql.js';
import {ExpectedWorstCaseGasPrice, PendingExecutionStored, String0x, TransactionParametersUsed} from 'fuzd-common';

const logger = logs('fuzd-server-executor-storage-sql');

type BroadcasterInDB = {
	address: String0x;
	chainId: String0x;
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
	account: String0x;
	chainId: String0x;
	slot: string;
	batchIndex: number;
	derivationParameters: string;
	onBehalf: String0x | null;
	nextCheckTime: number;
	initialTime: number;
	broadcastTime: number | null;
	hash: String0x;
	maxFeePerGasAuthorized: String0x;
	helpedForUpToGasPrice: String0x | null;
	expectedWorstCaseGasPrice: String0x | null;
	isVoidTransaction: 0 | 1;
	finalized: 0 | 1;
	retries: number | null;
	lastError: string | null;
	expiryTime: number | null;
	broadcaster: String0x;
	nonce: String0x;
	transactionParametersUsed: string;
	transactionData: string;
};

type ExpectedWorstCaseGasPriceInDB = {
	chainId: String0x;
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

function toExpectedGasPriceInDB(chainId: String0x, obj: ExpectedWorstCaseGasPrice): ExpectedWorstCaseGasPriceInDB {
	return {
		chainId,
		currentExpectedGasPrice: obj.current?.toString() || null,
		expectedGasPriceUpdate: obj.updateTimestamp || null,
		previousExpectedGasPrice: obj.previous?.toString() || null,
	};
}

function fromExecutionInDB<TransactionDataType>(inDB: ExecutionInDB): PendingExecutionStored<TransactionDataType> {
	const extraTransactionParametersUsed = JSON.parse(inDB.transactionParametersUsed);
	return {
		chainId: inDB.chainId,
		account: inDB.account,
		slot: inDB.slot,
		batchIndex: inDB.batchIndex,
		onBehalf: inDB.onBehalf || undefined,
		derivationParameters: JSON.parse(inDB.derivationParameters),
		initialTime: inDB.initialTime,
		broadcastTime: inDB.broadcastTime || undefined,
		nextCheckTime: inDB.nextCheckTime,
		hash: inDB.hash,
		maxFeePerGasAuthorized: inDB.maxFeePerGasAuthorized,
		helpedForUpToGasPrice: inDB.helpedForUpToGasPrice || undefined,
		expectedWorstCaseGasPrice: inDB.expectedWorstCaseGasPrice || undefined,
		isVoidTransaction: inDB.isVoidTransaction == 1 ? true : false,
		retries: inDB.retries || undefined,
		lastError: inDB.lastError || undefined,
		expiryTime: inDB.expiryTime || undefined,
		transaction: JSON.parse(inDB.transactionData),
		finalized: inDB.finalized == 0 ? false : true,
		transactionParametersUsed: {
			from: inDB.broadcaster,
			nonce: inDB.nonce,
			maxFeePerGas: extraTransactionParametersUsed.maxFeePerGas,
			maxPriorityFeePerGas: extraTransactionParametersUsed.maxPriorityFeePerGas,
		},
	};
}

function toExecutionInDB<TransactionDataType>(obj: PendingExecutionStored<TransactionDataType>): ExecutionInDB {
	return {
		chainId: obj.chainId,
		account: obj.account,
		slot: obj.slot,
		batchIndex: obj.batchIndex,
		derivationParameters: JSON.stringify(obj.derivationParameters),
		onBehalf: obj.onBehalf || null,
		initialTime: obj.initialTime,
		broadcastTime: obj.broadcastTime || null,
		nextCheckTime: obj.nextCheckTime,
		hash: obj.hash,
		maxFeePerGasAuthorized: obj.maxFeePerGasAuthorized,
		helpedForUpToGasPrice: obj.helpedForUpToGasPrice || null,
		expectedWorstCaseGasPrice: obj.expectedWorstCaseGasPrice || null,
		isVoidTransaction: obj.isVoidTransaction ? 1 : 0,
		retries: typeof obj.retries === 'undefined' ? null : obj.retries,
		lastError: obj.lastError || null,
		expiryTime: obj.expiryTime || null,
		broadcaster: obj.transactionParametersUsed.from,
		nonce: obj.transactionParametersUsed.nonce,
		transactionParametersUsed: JSON.stringify(obj.transactionParametersUsed),
		transactionData: JSON.stringify(obj.transaction),
		finalized: obj.finalized ? 1 : 0,
	};
}

export class RemoteSQLExecutorStorage<TransactionDataType> implements ExecutorStorage<TransactionDataType> {
	constructor(private db: RemoteSQL) {}

	async getPendingExecution(params: {
		chainId: String0x;
		account: String0x;
		slot: string;
		batchIndex: number;
	}): Promise<PendingExecutionStored<TransactionDataType> | undefined> {
		const statement = this.db.prepare(
			'SELECT * FROM BroadcastedExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3 AND batchIndex = ?4;',
		);
		const {account, chainId, slot, batchIndex} = params;
		const {results} = await statement.bind(account, chainId, slot, batchIndex).all<ExecutionInDB>();
		if (results.length === 0) {
			return undefined;
		} else {
			return fromExecutionInDB(results[0]);
		}
	}

	async getPendingExecutionBatch(params: {
		chainId: String0x;
		account: String0x;
		slot: string;
	}): Promise<PendingExecutionStored<TransactionDataType>[] | undefined> {
		const statement = this.db.prepare(
			'SELECT * FROM BroadcastedExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;',
		);
		const {account, chainId, slot} = params;
		const {results} = await statement.bind(account, chainId, slot).all<ExecutionInDB>();
		return results.map(fromExecutionInDB<TransactionDataType>);
	}

	async deletePendingExecution(params: {
		chainId: String0x;
		account: String0x;
		slot: string;
		batchIndex: number;
	}): Promise<void> {
		const statement = this.db.prepare(
			'DELETE FROM BroadcastedExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3 AND batchIndex = ?4;',
		);
		const {account, chainId, slot, batchIndex} = params;
		await statement.bind(account, chainId, slot, batchIndex).all();
	}

	async createOrUpdatePendingExecutionAndUpdateNonceIfNeeded(
		executionToStore: PendingExecutionStored<TransactionDataType>,
		asPaymentFor?: {
			chainId: String0x;
			account: String0x;
			slot: string;
			batchIndex: number;
			upToGasPrice: bigint;
		},
	): Promise<PendingExecutionStored<TransactionDataType>> {
		const inDB = toExecutionInDB(executionToStore);
		const {values, columns, bindings, overwrites} = toValues(inDB);
		const sqlExecutionInsertionStatement = `INSERT INTO BroadcastedExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot, batchIndex) DO UPDATE SET ${overwrites};`;
		logger.debug(sqlExecutionInsertionStatement);
		const executionInsertionStatement = this.db.prepare(sqlExecutionInsertionStatement);

		// TODO use number of string ?
		const nonceUsed = Number(executionToStore.transactionParametersUsed.nonce);
		if (`0x${nonceUsed.toString(16)}` != executionToStore.transactionParametersUsed.nonce) {
			throw new Error(
				`could not handle nonce comversion to number: ${executionToStore.transactionParametersUsed.nonce}`,
			);
		}
		const nextNonce = nonceUsed + 1;
		const broadcasterInDB = toBroadcasterInDB({
			address: executionToStore.transactionParametersUsed.from,
			chainId: executionToStore.chainId,
			nextNonce,
		});
		const broadcasterTableData = toValues(broadcasterInDB);
		const sqlUpdateNonceStatement = `INSERT INTO Broadcasters (${broadcasterTableData.columns}) VALUES (${broadcasterTableData.bindings}) ON CONFLICT(address, chainId) DO UPDATE SET nextNonce = MAX(nextNonce, excluded.nextNonce);`;
		const updateNonceStatement = this.db.prepare(sqlUpdateNonceStatement);
		if (asPaymentFor) {
			const asPaymentForStatement = this.db.prepare(
				`UPDATE BroadcastedExecutions SET helpedForUpToGasPrice = ?1 WHERE chainId = ?2 AND account = ?3 AND slot = ?4 AND batchIndex = ?5;`,
			);
			await this.db.batch([
				updateNonceStatement.bind(...broadcasterTableData.values),
				executionInsertionStatement.bind(...values),
				asPaymentForStatement.bind(
					asPaymentFor.upToGasPrice,
					asPaymentFor.chainId,
					asPaymentFor.account,
					asPaymentFor.slot,
					asPaymentFor.batchIndex,
				),
			]);
		} else {
			await this.db.batch([
				updateNonceStatement.bind(...broadcasterTableData.values),
				executionInsertionStatement.bind(...values),
			]);
		}
		return executionToStore;
	}

	async getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]> {
		const statement = this.db.prepare(
			`SELECT * FROM BroadcastedExecutions  WHERE finalized = FALSE  ORDER BY nextCheckTime ASC LIMIT ?1;`,
		);
		const {results} = await statement.bind(params.limit).all<ExecutionInDB>();
		return results.map(fromExecutionInDB<TransactionDataType>);
	}

	async getAllExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM BroadcastedExecutions ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ExecutionInDB>();
		return results.map(fromExecutionInDB<TransactionDataType>);
	}

	// TODO use this to update teh tx
	async getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: String0x;
			broadcaster: String0x;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored<TransactionDataType>[]> {
		const statement = this.db.prepare(
			`SELECT * FROM BroadcastedExecutions WHERE broadcaster = ?1 AND chainId = ?2 ORDER BY nonce ASC LIMIT ?3;`,
		);
		const {results} = await statement
			.bind(broadcasterData.broadcaster, broadcasterData.chainId, params.limit)
			.all<ExecutionInDB>();
		return results.map(fromExecutionInDB<TransactionDataType>);
	}

	async getBroadcaster(params: {chainId: String0x; address: string}): Promise<BroadcasterData | undefined> {
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
		const delteBroadcastedExecutions = this.db.prepare(`DELETE FROM BroadcastedExecutions`);
		await this.db.batch([deleteBroadcasters, delteBroadcastedExecutions]);
	}

	async setup(): Promise<void> {
		const statements = sqlToStatements(setupTables);
		await this.db.batch(statements.map((v) => this.db.prepare(v)));
	}

	async getExpectedWorstCaseGasPrice(chainId: String0x): Promise<ExpectedWorstCaseGasPrice> {
		const statement = this.db.prepare(`SELECT * FROM ChainConfigurations WHERE chainId = ?1;`);
		const {results} = await statement.bind(chainId).all<ExpectedWorstCaseGasPriceInDB>();
		if (results.length === 0) {
			return {previous: undefined, current: undefined, updateTimestamp: undefined};
		} else {
			return fromExpectedGasPriceInDB(results[0]);
		}
	}

	async updateExpectedWorstCaseGasPrice(
		chainId: String0x,
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

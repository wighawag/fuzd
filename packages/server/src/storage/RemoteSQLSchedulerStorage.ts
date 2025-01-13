import type {RemoteSQL} from 'remote-sql';
import type {ScheduledExecutionQueued, SchedulerStorage} from 'fuzd-scheduler';
import {sqlToStatements, toValues} from './utils.js';
import setupTables from '../schema/ts/scheduler.sql.js';
import {IntegerString, String0x} from 'fuzd-common';

type ScheduledExecutionInDB = {
	account: String0x;
	chainId: IntegerString;
	slot: string;

	onBehalf: String0x | null;

	broadcasted: 0 | 1;
	finalized: 0 | 1;
	nextCheckTime: number;

	type: 'time-locked' | 'clear';
	payload: string; // include the tx in clear or the tx to submit to the executor (string)
	timing: string;
	// TODO initialTimeTarget: number;
	executionServiceParameters: string;
	paymentReserve: string | null;
	broadcaster: String0x | null;

	priorTransactionConfirmation: string | null;
	retries: number | null;
	expiry: number | null;
};

function fromScheduledExecutionInDB<TransactionDataType>(
	inDB: ScheduledExecutionInDB,
): ScheduledExecutionQueued<TransactionDataType> {
	if (inDB.type === 'time-locked') {
		return {
			account: inDB.account,
			chainId: inDB.chainId,
			slot: inDB.slot,
			onBehalf: inDB.onBehalf || undefined,
			type: 'time-locked',
			broadcasted: inDB.broadcasted == 1 ? true : false,
			finalized: inDB.finalized == 1 ? true : false,
			checkinTime: inDB.nextCheckTime,
			payload: inDB.payload,
			timing: JSON.parse(inDB.timing),
			executionServiceParameters: JSON.parse(inDB.executionServiceParameters),
			paymentReserve:
				inDB.paymentReserve && inDB.broadcaster
					? {amount: inDB.paymentReserve, broadcaster: inDB.broadcaster}
					: undefined,

			retries: inDB.retries || 0,
			priorTransactionConfirmation: inDB.priorTransactionConfirmation
				? JSON.parse(inDB.priorTransactionConfirmation)
				: undefined,
		};
	} else {
		return {
			account: inDB.account,
			chainId: inDB.chainId,
			slot: inDB.slot,
			onBehalf: inDB.onBehalf || undefined,
			type: 'clear',
			broadcasted: inDB.broadcasted == 1 ? true : false,
			finalized: inDB.finalized == 1 ? true : false,
			checkinTime: inDB.nextCheckTime,
			timing: JSON.parse(inDB.timing),
			paymentReserve:
				inDB.paymentReserve && inDB.broadcaster
					? {amount: inDB.paymentReserve, broadcaster: inDB.broadcaster}
					: undefined,
			executionServiceParameters: JSON.parse(inDB.executionServiceParameters),

			retries: inDB.retries || 0,
			priorTransactionConfirmation: inDB.priorTransactionConfirmation
				? JSON.parse(inDB.priorTransactionConfirmation)
				: undefined,
			executions: JSON.parse(inDB.payload),
		};
	}
}

function toScheduledExecutionInDB<TransactionDataType>(
	obj: ScheduledExecutionQueued<TransactionDataType>,
): ScheduledExecutionInDB {
	return {
		account: obj.account,
		chainId: obj.chainId,

		// TODO broadcaster expected / or we use the executionServiceParameters ?
		slot: obj.slot,

		onBehalf: obj.onBehalf || null,

		broadcasted: obj.broadcasted ? 1 : 0,
		finalized: obj.finalized ? 1 : 0,
		nextCheckTime: obj.checkinTime,

		type: obj.type,
		payload: obj.type === 'clear' ? JSON.stringify(obj.executions) : obj.payload,
		timing: JSON.stringify(obj.timing),
		executionServiceParameters: JSON.stringify(obj.executionServiceParameters),
		paymentReserve: obj.paymentReserve ? obj.paymentReserve.amount : null,
		broadcaster: obj.paymentReserve ? obj.paymentReserve.broadcaster : null,

		priorTransactionConfirmation: obj.priorTransactionConfirmation
			? JSON.stringify(obj.priorTransactionConfirmation)
			: null,
		// TODO initialTimeTarget: 0, // TODO obj.initialTimeTarget.
		retries: obj.retries,
		expiry: 0, // TODO obj.expiry,
	};
}

export class RemoteSQLSchedulerStorage<TransactionDataType> implements SchedulerStorage<TransactionDataType> {
	constructor(private db: RemoteSQL) {}

	async getQueuedExecution(params: {
		chainId: IntegerString;
		account: String0x;
		slot: string;
	}): Promise<ScheduledExecutionQueued<TransactionDataType> | undefined> {
		const sqlStatement = 'SELECT * FROM ScheduledExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;';
		const statement = this.db.prepare(sqlStatement);
		const {account, chainId, slot} = params;
		const {results} = await statement.bind(account, chainId, slot).all<ScheduledExecutionInDB>();
		if (results.length === 0) {
			return undefined;
		} else {
			return fromScheduledExecutionInDB(results[0]);
		}
	}
	async getQueuedExecutionsForAccount(params: {
		chainId: IntegerString;
		account: String0x;
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = 'SELECT * FROM ScheduledExecutions WHERE account = ?1 AND chainId = ?2;';
		const statement = this.db.prepare(sqlStatement);
		const {account, chainId} = params;
		const {results} = await statement.bind(account, chainId).all<ScheduledExecutionInDB>();

		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async deleteExecution(params: {chainId: IntegerString; account: String0x; slot: string}): Promise<void> {
		const sqlStatement = 'DELETE FROM ScheduledExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;';

		const statement = this.db.prepare(sqlStatement);
		const {account, chainId, slot} = params;
		await statement.bind(account, chainId, slot).all();
	}

	// TODO add reason for archive
	async archiveExecution(executionToStore: ScheduledExecutionQueued<TransactionDataType>): Promise<void> {
		const {account, chainId, slot} = executionToStore;
		const inDB = toScheduledExecutionInDB(executionToStore);
		const {values, columns, bindings} = toValues(inDB);

		const deleteFromExecutions = this.db.prepare(
			'DELETE FROM ScheduledExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;',
		);
		const insertIntoArchive = this.db.prepare(
			`INSERT INTO ArchivedScheduledExecutions (${columns}) VALUES(${bindings})`,
		);
		await this.db.batch([deleteFromExecutions.bind(account, chainId, slot), insertIntoArchive.bind(...values)]);
	}

	async createOrUpdateQueuedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
	): Promise<ScheduledExecutionQueued<TransactionDataType>> {
		const inDB = toScheduledExecutionInDB(executionToStore);
		const {values, columns, bindings, overwrites} = toValues(inDB);
		const sqlStatement = `INSERT INTO ScheduledExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot) DO UPDATE SET ${overwrites};`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(...values).all();
		return executionToStore;
	}

	async getQueueTopMostExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE broadcasted = FALSE ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getUnFinalizedBroadcastedScheduledExecutions(params: {
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE broadcasted = TRUE AND finalized = FALSE ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getUnFinalizedScheduledExecutionsPerBroadcaster(params: {
		chainId: IntegerString;
		broadcaster: String0x;
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE chainId = ?1 AND broadcaster = ?2 AND finalized = FALSE ORDER BY nextCheckTime ASC LIMIT ?3;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement
			.bind(params.chainId, params.broadcaster, params.limit)
			.all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAllExecutions(params: {limit: number}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAccountSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE account = ?1 ORDER BY nextCheckTime ASC LIMIT ?2;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(account, params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAccountArchivedSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ArchivedScheduledExecutions WHERE account = ?1 ORDER BY nextCheckTime ASC LIMIT ?2;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(account, params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async clear(): Promise<void> {
		const deleteScheduledExecutions = this.db.prepare(`DELETE FROM ScheduledExecutions;`);
		const deleteArchivedScheduledExecutions = this.db.prepare(`DELETE FROM ArchivedScheduledExecutions;`);
		await this.db.batch([deleteScheduledExecutions, deleteArchivedScheduledExecutions]);
	}

	async setup(): Promise<void> {
		const statements = sqlToStatements(setupTables);
		await this.db.batch(statements.map((v) => this.db.prepare(v)));
	}
}

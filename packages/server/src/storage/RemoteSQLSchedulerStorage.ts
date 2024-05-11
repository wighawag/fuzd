import type {RemoteSQL} from 'remote-sql';
import type {ExecutionQueued, SchedulerStorage} from 'fuzd-scheduler';
import {sqlToStatements, toValues} from './utils';
import setupTables from '../schema/ts/scheduler.sql';

type ScheduledExecutionInDB = {
	account: `0x${string}`;
	chainId: `0x${string}`;
	slot: string;

	broadcasted: 0 | 1;
	nextCheckTime: number;

	type: 'time-locked' | 'clear';
	payload: string; // include the tx in clear or the tx to submit to the executor (string)
	timing: string;
	// TODO initialTimeTarget: number;
	expectedMaxFeePerGas: string;
	paymentReserve: string | null;

	priorTransactionConfirmation: string | null;
	retries: number | null;
	expiry: number | null;
};

function fromScheduledExecutionInDB<TransactionDataType>(
	inDB: ScheduledExecutionInDB,
): ExecutionQueued<TransactionDataType> {
	console.log(inDB);
	if (inDB.type === 'time-locked') {
		return {
			account: inDB.account,
			chainId: inDB.chainId,
			slot: inDB.slot,
			type: 'time-locked',
			broadcasted: inDB.broadcasted == 0 ? false : true,
			checkinTime: inDB.nextCheckTime,
			payload: inDB.payload,
			timing: JSON.parse(inDB.timing),
			expectedMaxFeePerGas: inDB.expectedMaxFeePerGas,
			paymentReserve: inDB.paymentReserve || undefined,

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
			type: 'clear',
			broadcasted: inDB.broadcasted == 0 ? false : true,
			checkinTime: inDB.nextCheckTime,
			timing: JSON.parse(inDB.timing),
			expectedMaxFeePerGas: inDB.expectedMaxFeePerGas,
			paymentReserve: inDB.paymentReserve || undefined,

			retries: inDB.retries || 0,
			priorTransactionConfirmation: inDB.priorTransactionConfirmation
				? JSON.parse(inDB.priorTransactionConfirmation)
				: undefined,
			transactions: JSON.parse(inDB.payload),
		};
	}
}

function toScheduledExecutionInDB<TransactionDataType>(
	obj: ExecutionQueued<TransactionDataType>,
): ScheduledExecutionInDB {
	return {
		account: obj.account,
		chainId: obj.chainId,
		slot: obj.slot,

		broadcasted: obj.broadcasted ? 1 : 0,
		nextCheckTime: obj.checkinTime,

		type: obj.type,
		payload: obj.type === 'clear' ? JSON.stringify(obj.transactions) : obj.payload,
		timing: JSON.stringify(obj.timing),
		expectedMaxFeePerGas: obj.expectedMaxFeePerGas,
		paymentReserve: obj.paymentReserve || null,

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
		chainId: `0x${string}`;
		account: `0x${string}`;
		slot: string;
	}): Promise<ExecutionQueued<TransactionDataType> | undefined> {
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
		chainId: `0x${string}`;
		account: `0x${string}`;
		limit: number;
	}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = 'SELECT * FROM ScheduledExecutions WHERE account = ?1 AND chainId = ?2;';
		const statement = this.db.prepare(sqlStatement);
		const {account, chainId} = params;
		const {results} = await statement.bind(account, chainId).all<ScheduledExecutionInDB>();

		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async deleteExecution(params: {chainId: `0x${string}`; account: `0x${string}`; slot: string}): Promise<void> {
		const sqlStatement = 'DELETE FROM ScheduledExecutions WHERE account = ?1 AND chainId = ?2 AND slot = ?3;';

		const statement = this.db.prepare(sqlStatement);
		const {account, chainId, slot} = params;
		await statement.bind(account, chainId, slot).all();
	}

	// TODO add reason for archive
	async archiveExecution(executionToStore: ExecutionQueued<TransactionDataType>): Promise<void> {
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
		executionToStore: ExecutionQueued<TransactionDataType>,
	): Promise<ExecutionQueued<TransactionDataType>> {
		const inDB = toScheduledExecutionInDB(executionToStore);
		const {values, columns, bindings, overwrites} = toValues(inDB);
		const sqlStatement = `INSERT INTO ScheduledExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot) DO UPDATE SET ${overwrites};`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(...values).all();
		return executionToStore;
	}

	async getQueueTopMostExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE broadcasted = FALSE ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAllExecutions(params: {limit: number}): Promise<ExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAccountSubmissions(
		account: `0x${string}`,
		params: {limit: number},
	): Promise<ExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE account = ?1 ORDER BY nextCheckTime ASC LIMIT ?2;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(account, params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAccountArchivedSubmissions(
		account: `0x${string}`,
		params: {limit: number},
	): Promise<ExecutionQueued<TransactionDataType>[]> {
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

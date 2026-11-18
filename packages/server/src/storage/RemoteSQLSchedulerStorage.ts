import type {RemoteSQL} from 'remote-sql';
import type {ScheduledExecutionQueued, SchedulerStorage} from '@fuzd/scheduler';
import {MAX_SLOTS_PER_STATEMENT, chunks, setupClaimColumns, sqlToStatements, toValues} from './utils.js';
import setupTables from '../schema/ts/scheduler.sql.js';
import {IntegerString, String0x} from '@fuzd/common';

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

	lastError: string | null;
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

			lastError: inDB.lastError || undefined,
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
			lastError: inDB.lastError || undefined,
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
		lastError: obj.lastError || null,
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
		// writing an execution back releases the claim on it (docs/adr/0004)
		const sqlStatement = `INSERT INTO ScheduledExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot) DO UPDATE SET ${overwrites}, claimedBy = NULL, claimExpiresAt = NULL;`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(...values).all();
		return executionToStore;
	}

	async getQueueTopMostExecutions(params: {
		limit: number;
		chainId?: IntegerString;
		upToCheckinTime?: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const conditions = ['broadcasted = FALSE'];
		const bindings: (string | number)[] = [params.limit];
		if (params.chainId !== undefined) {
			bindings.push(params.chainId);
			conditions.push(`chainId = ?${bindings.length}`);
		}
		if (params.upToCheckinTime !== undefined) {
			bindings.push(params.upToCheckinTime);
			conditions.push(`nextCheckTime <= ?${bindings.length}`);
		}
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE ${conditions.join(' AND ')} ORDER BY nextCheckTime ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(...bindings).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async claimDueExecutions(params: {
		limit: number;
		chainId: IntegerString;
		upToCheckinTime: number;
		claim: {by: string; now: number; expiresAt: number};
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		// one statement: SQLite (and D1) runs it atomically, so a row is claimed by one run only.
		// One account at a time (docs/adr/0004): the first `limit` due executions, leaving out every
		// account another run holds an execution of. The executions of one account share a broadcaster
		// and its nonces, so they go to one run at a time, which sends them in order. This run's own
		// accounts are not left out: its next batch carries on with them, in order.
		// The `+` keep SQLite from using the chainId index for the held accounts: they come from the
		// claimedBy index (a handful of rows) instead.
		const due = `chainId = ?3 AND broadcasted = FALSE AND nextCheckTime <= ?4 AND (claimExpiresAt IS NULL OR claimExpiresAt <= ?5)`;
		const heldByOthers = `SELECT account FROM ScheduledExecutions WHERE claimedBy > '' AND claimedBy != ?1 AND claimExpiresAt > ?5 AND +chainId = ?3`;
		const sqlStatement = `UPDATE ScheduledExecutions SET claimedBy = ?1, claimExpiresAt = ?2 WHERE rowid IN (SELECT rowid FROM ScheduledExecutions WHERE ${due} AND account NOT IN (${heldByOthers}) ORDER BY nextCheckTime ASC LIMIT ?6) RETURNING *;`;
		const {by, now, expiresAt} = params.claim;
		const {results} = await this.db
			.prepare(sqlStatement)
			.bind(by, expiresAt, params.chainId, params.upToCheckinTime, now, params.limit)
			.all<ScheduledExecutionInDB>();
		// RETURNING does not keep the order of the selection
		return results
			.sort((a, b) => a.nextCheckTime - b.nextCheckTime)
			.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async releaseExecutionClaims(claimant: string): Promise<void> {
		await this.db
			.prepare(`UPDATE ScheduledExecutions SET claimedBy = NULL, claimExpiresAt = NULL WHERE claimedBy = ?1;`)
			.bind(claimant)
			.all();
	}

	async updateClaimedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
		claimant: string,
	): Promise<boolean> {
		const inDB = toScheduledExecutionInDB(executionToStore);
		const {account, chainId, slot, ...rest} = inDB;
		const columns = Object.keys(rest);
		// ?1 to ?4: the key and the claimant, then the columns
		const sets = columns.map((column, i) => `${column} = ?${i + 5}`).join(', ');
		const {results} = await this.db
			.prepare(
				`UPDATE ScheduledExecutions SET ${sets}, claimedBy = NULL, claimExpiresAt = NULL WHERE account = ?1 AND chainId = ?2 AND slot = ?3 AND claimedBy = ?4 RETURNING slot;`,
			)
			.bind(account, chainId, slot, claimant, ...columns.map((column) => (rest as Record<string, unknown>)[column]))
			.all<{slot: string}>();
		return results.length > 0;
	}

	async markExecutionsFinalized(params: {
		chainId: IntegerString;
		slots: {account: String0x; slot: string}[];
	}): Promise<{account: String0x; slot: string}[]> {
		const applied: {account: String0x; slot: string}[] = [];
		// D1 takes at most 100 bound parameters per statement: ?1 is the chain, then 2 per slot. The `+`
		// keep SQLite on the account index (the listed accounts' rows), not on every broadcast row of the chain
		for (const slots of chunks(params.slots, MAX_SLOTS_PER_STATEMENT)) {
			const pairs = slots.map((_, i) => `(?${2 * i + 2}, ?${2 * i + 3})`).join(', ');
			const {results} = await this.db
				.prepare(
					`UPDATE ScheduledExecutions SET finalized = TRUE WHERE +chainId = ?1 AND +broadcasted = TRUE AND (account, slot) IN (VALUES ${pairs}) RETURNING account, slot;`,
				)
				.bind(params.chainId, ...slots.flatMap((v) => [v.account, v.slot]))
				.all<{account: String0x; slot: string}>();
			applied.push(...results);
		}
		return applied;
	}

	async archiveClaimedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
		claimant: string,
	): Promise<boolean> {
		const {account, chainId, slot} = executionToStore;
		const inDB = toScheduledExecutionInDB(executionToStore);
		const columns = Object.keys(inDB);
		const values = columns.map((column) => (inDB as Record<string, unknown>)[column]);
		// ?1 to ?4: the key and the claimant, then the columns. One batch (a transaction): the archive
		// row is written only if the claim is still held, then the row is deleted under the same guard
		const held = `account = ?1 AND chainId = ?2 AND slot = ?3 AND claimedBy = ?4`;
		const insertIntoArchive = this.db
			.prepare(
				`INSERT INTO ArchivedScheduledExecutions (${columns.join(', ')}) SELECT ${columns.map((_, i) => `?${i + 5}`).join(', ')} WHERE EXISTS (SELECT 1 FROM ScheduledExecutions WHERE ${held});`,
			)
			.bind(account, chainId, slot, claimant, ...values);
		const deleteFromExecutions = this.db
			.prepare(`DELETE FROM ScheduledExecutions WHERE ${held} RETURNING slot;`)
			.bind(account, chainId, slot, claimant);
		const [, deleted] = await this.db.batch<{slot: string}>([insertIntoArchive, deleteFromExecutions]);
		return deleted.results.length > 0;
	}

	async getUnFinalizedBroadcastedScheduledExecutions(params: {
		limit: number;
		chainId?: IntegerString;
		after?: {checkinTime: number; account: String0x; slot: string};
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const conditions = ['broadcasted = TRUE', 'finalized = FALSE'];
		const bindings: (string | number)[] = [params.limit];
		if (params.chainId !== undefined) {
			bindings.push(params.chainId);
			conditions.push(`chainId = ?${bindings.length}`);
		}
		if (params.after) {
			bindings.push(params.after.checkinTime, params.after.account, params.after.slot);
			const n = bindings.length;
			conditions.push(`(nextCheckTime, account, slot) > (?${n - 2}, ?${n - 1}, ?${n})`);
		}
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE ${conditions.join(' AND ')} ORDER BY nextCheckTime ASC, account ASC, slot ASC LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(...bindings).all<ScheduledExecutionInDB>();
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

	async getAllExecutions(params: {
		limit: number;
		order: 'ASC' | 'DESC';
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions ORDER BY nextCheckTime ${params.order} LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ScheduledExecutionInDB>();
		return results.map(fromScheduledExecutionInDB<TransactionDataType>);
	}

	async getAccountSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM ScheduledExecutions WHERE account = ?1 ORDER BY nextCheckTime DESC LIMIT ?2;`;
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

	async deleteFinalizedScheduledExecutions(params: {chainId?: IntegerString; upTo?: number}): Promise<void> {
		let execution = this.db
			.prepare(`DELETE FROM ScheduledExecutions WHERE finalized = 1 AND nextCheckTime <= ?1`)
			.bind(params.upTo || Number.MAX_SAFE_INTEGER);
		if (params.chainId) {
			execution = this.db
				.prepare(`DELETE FROM ScheduledExecutions WHERE finalized = 1 AND nextCheckTime <= ?1 AND chainId = ?2`)
				.bind(params.upTo || Number.MAX_SAFE_INTEGER, params.chainId);
		}

		await execution.all();
	}

	async clear(): Promise<void> {
		const deleteScheduledExecutions = this.db.prepare(`DELETE FROM ScheduledExecutions;`);
		const deleteArchivedScheduledExecutions = this.db.prepare(`DELETE FROM ArchivedScheduledExecutions;`);
		await this.db.batch([deleteScheduledExecutions, deleteArchivedScheduledExecutions]);
	}

	async setup(): Promise<void> {
		const statements = sqlToStatements(setupTables);
		await this.db.batch(statements.map((v) => this.db.prepare(v)));
		// the old table may lack the claim columns, which the batch above cannot add
		await setupClaimColumns(this.db, 'ScheduledExecutions');
	}
}

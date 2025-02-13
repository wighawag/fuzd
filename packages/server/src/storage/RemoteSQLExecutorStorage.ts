import type {RemoteSQL, SQLPreparedStatement} from 'remote-sql';
import type {ExecutorStorage, BroadcasterData, ChainConfiguration, BroadcasterDataWithLock} from 'fuzd-executor';
import {sqlToStatements, toValues} from './utils.js';
import {logs} from 'named-logs';
import setupTables from '../schema/ts/executor.sql.js';
import {FUZDLogger, Fees, IntegerString, PendingExecutionStored, String0x, UpdateableParameter} from 'fuzd-common';
import {wait} from '../utils/time.js';

const logger = <FUZDLogger>logs('fuzd-server-executor-storage-sql');

type BroadcasterInDB = {
	address: String0x;
	chainId: IntegerString;

	nextNonce: number;
	lock: string | null;
	lock_timestamp: number | null;

	debt_18: string;
	debt_0: string;
};

function fromBroadcasterInDB(inDB: BroadcasterInDB): BroadcasterData {
	return {
		address: inDB.address,
		chainId: inDB.chainId,
		nextNonce: inDB.nextNonce,
		lock: inDB.lock,
		lock_timestamp: inDB.lock_timestamp,

		debt: BigInt(inDB.debt_18) * 1000000000000000000n + BigInt(inDB.debt_0),
	};
}

function toBroadcasterInDB(obj: BroadcasterData): BroadcasterInDB {
	return {
		address: obj.address,
		chainId: obj.chainId,
		nextNonce: obj.nextNonce,
		lock: obj.lock,
		lock_timestamp: obj.lock_timestamp,

		debt_18: (obj.debt / 1000000000000000000n).toString(),
		debt_0: (obj.debt % 1000000000000000000n).toString(),
	};
}

type ExecutionInDB = {
	account: String0x;
	chainId: IntegerString;
	slot: string;
	batchIndex: number;
	serviceParameters: string;
	onBehalf: String0x | null;
	nextCheckTime: number;
	initialTime: number;
	bestTime: number | null;
	broadcastTime: number | null;
	hash: String0x;
	maxFeePerGasAuthorized: String0x;
	helpedForUpToGasPrice: string | null;
	isVoidTransaction: 0 | 1;
	finalized: 0 | 1;
	retries: number | null;
	lastError: string | null;
	expiryTime: number | null;
	broadcaster: String0x;
	nonce: String0x;
	transactionParametersUsed: string;
	transactionData: string;
	debtAssigned: string;
};

type ChainConfigurationsInDB = {
	chainId: IntegerString;
	expectedGasPrice_current: string | null;
	expectedGasPrice_previous: string | null;
	expectedGasPrice_update: number | null;

	fees_current: string | null;
	fees_previous: string | null;
	fees_update: number | null;
};

function fromChainConfigurationsInDB(inDb: ChainConfigurationsInDB): ChainConfiguration {
	const fees_current = inDb.fees_current ? JSON.parse(inDb.fees_current) : null;
	const fees_previous = inDb.fees_previous ? JSON.parse(inDb.fees_previous) : null;
	return {
		expectedWorstCaseGasPrice: inDb.expectedGasPrice_current
			? {
					previous: inDb.expectedGasPrice_previous || undefined,
					current: inDb.expectedGasPrice_current,
					updateTimestamp: inDb.expectedGasPrice_update || 0,
				}
			: undefined,
		fees: fees_current
			? {
					previous: fees_previous || undefined,
					current: fees_current,
					updateTimestamp: inDb.fees_update || 0,
				}
			: undefined,
	};
}

function fromExecutionInDB<TransactionDataType>(inDB: ExecutionInDB): PendingExecutionStored<TransactionDataType> {
	// TODO remove once clean
	if (inDB.helpedForUpToGasPrice) {
		const value = JSON.parse(inDB.helpedForUpToGasPrice);
		if (typeof value == 'number') {
			inDB.helpedForUpToGasPrice = null;
		}
	}

	const extraTransactionParametersUsed = JSON.parse(inDB.transactionParametersUsed);
	return {
		chainId: inDB.chainId,
		account: inDB.account,
		slot: inDB.slot,
		batchIndex: inDB.batchIndex,
		onBehalf: inDB.onBehalf || undefined,
		serviceParameters: JSON.parse(inDB.serviceParameters),
		initialTime: inDB.initialTime,
		bestTime: inDB.bestTime || undefined,
		broadcastTime: inDB.broadcastTime || undefined,
		nextCheckTime: inDB.nextCheckTime,
		hash: inDB.hash,
		maxFeePerGasAuthorized: inDB.maxFeePerGasAuthorized,
		helpedForUpToGasPrice: inDB.helpedForUpToGasPrice ? JSON.parse(inDB.helpedForUpToGasPrice) : undefined,
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
		debtAssigned: inDB.debtAssigned,
	};
}

function toExecutionInDB<TransactionDataType>(obj: PendingExecutionStored<TransactionDataType>): ExecutionInDB {
	return {
		chainId: obj.chainId,
		account: obj.account,
		slot: obj.slot,
		batchIndex: obj.batchIndex,
		serviceParameters: JSON.stringify(obj.serviceParameters),
		onBehalf: obj.onBehalf || null,
		initialTime: obj.initialTime,
		bestTime: obj.bestTime || null,
		broadcastTime: obj.broadcastTime || null,
		nextCheckTime: obj.nextCheckTime,
		hash: obj.hash,
		maxFeePerGasAuthorized: obj.maxFeePerGasAuthorized,
		helpedForUpToGasPrice: obj.helpedForUpToGasPrice ? JSON.stringify(obj.helpedForUpToGasPrice) : null,
		isVoidTransaction: obj.isVoidTransaction ? 1 : 0,
		retries: typeof obj.retries === 'undefined' ? null : obj.retries,
		lastError: obj.lastError || null,
		expiryTime: obj.expiryTime || null,
		broadcaster: obj.transactionParametersUsed.from,
		nonce: obj.transactionParametersUsed.nonce,
		transactionParametersUsed: JSON.stringify(obj.transactionParametersUsed),
		transactionData: JSON.stringify(obj.transaction),
		finalized: obj.finalized ? 1 : 0,
		debtAssigned: obj.debtAssigned,
	};
}

export class RemoteSQLExecutorStorage<TransactionDataType> implements ExecutorStorage<TransactionDataType> {
	constructor(private db: RemoteSQL) {}

	async getPendingExecution(params: {
		chainId: IntegerString;
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
		chainId: IntegerString;
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
		chainId: IntegerString;
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

	async lockBroadcaster(params: {
		chainId: IntegerString;
		address: string;
		nonceFromNetwork: number;
	}): Promise<BroadcasterDataWithLock | undefined> {
		// Generate 16 random bytes
		const randomBytes = new Uint8Array(16);
		crypto.getRandomValues(randomBytes);

		// Convert the bytes to a hexadecimal string
		const randomLock = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		const LOCK_EXPIRY_SECONDS = 30;
		// note here we only set nextNonce on insert, we do not touch if already exist
		// this is crucial
		await this.db
			.prepare(
				`INSERT INTO Broadcasters (address, chainId, nextNonce, lock, lock_timestamp, debt_18, debt_0)
            VALUES (?1, ?2, ?3, ?4, UNIXEPOCH(), '0', '0')
            ON CONFLICT(address, chainId) DO UPDATE SET
            lock = CASE
                WHEN lock IS NULL OR (UNIXEPOCH() - lock_timestamp) > ${LOCK_EXPIRY_SECONDS} THEN ?4
                ELSE lock
            	END,
			lock_timestamp = CASE
                WHEN lock_timestamp IS NULL OR (UNIXEPOCH() - lock_timestamp) > ${LOCK_EXPIRY_SECONDS} THEN UNIXEPOCH()
                ELSE lock_timestamp
            	END
		`,
			)
			.bind(params.address, params.chainId, params.nonceFromNetwork, randomLock)
			.all();

		const broadcaster = await this.getBroadcaster(params);

		if (!broadcaster) {
			logger.error(`instant check: no broadcaster found`);
			// throw new Error(`instant check: no broadcaster found`);
			return undefined;
		} else if (!broadcaster.lock || !broadcaster.lock_timestamp) {
			logger.error(`instant check: no lock found`);
			// throw new Error(`instant check: no lock found`);
			return undefined;
		} else if (broadcaster.lock !== randomLock) {
			logger.error(`instant check: lock not matching: ${randomLock} (Generated) va ${broadcaster.lock} (DB)`);
			// throw new Error(`instant check: lock not matching: ${randomLock} (Generated) va ${broadcaster.lock} (DB)`);
			return undefined;
		} else {
			// console.error(`broadcaster locked: ${broadcaster.lock}`);
			return broadcaster as BroadcasterDataWithLock;
		}
	}

	async unlockBroadcaster(params: {chainId: IntegerString; address: string}): Promise<void> {
		// console.error(`unlocking ${params.address}`);
		const sqlResetLockStatement = `UPDATE Broadcasters SET lock = NULL, lock_timestamp = NULL WHERE address = ?1 AND chainId = ?2;`;
		const resetLockStatement = this.db.prepare(sqlResetLockStatement);
		try {
			await resetLockStatement.bind(params.address, params.chainId).all();
		} catch (err) {
			console.error(`Failed to reset lock, retrying...`, err);
			try {
				await resetLockStatement.bind(params.address, params.chainId).all();
			} catch (err) {
				console.error(`Failed to reset lock again, skip, will expire in 30 seconds`, err);
			}
		}
	}

	async createOrUpdatePendingExecution(
		executionToStore: PendingExecutionStored<TransactionDataType>,
		{
			updateNonceIfNeeded,
			debtOffset,
		}: {updateNonceIfNeeded?: {broadcaster: String0x; lock: string}; debtOffset?: bigint},
		asPaymentFor?: {
			chainId: IntegerString;
			account: String0x;
			slot: string;
			batchIndex: number;
			helpedForUpToGasPrice: {upToGasPrice: bigint; valueSent: bigint};
		},
	): Promise<PendingExecutionStored<TransactionDataType>> {
		const inDB = toExecutionInDB(executionToStore);
		const {helpedForUpToGasPrice, ...valuesToConsider} = inDB;
		const {values, columns, bindings, overwrites} = toValues(valuesToConsider);
		const sqlExecutionInsertionStatement = `INSERT INTO BroadcastedExecutions (${columns}) VALUES(${bindings}) ON CONFLICT(account, chainId, slot, batchIndex) DO UPDATE SET ${overwrites} WHERE (finalized = FALSE);`;
		const executionInsertionStatement = this.db.prepare(sqlExecutionInsertionStatement);

		// TODO use number of string ?
		const nonceUsed = Number(executionToStore.transactionParametersUsed.nonce);
		if (`0x${nonceUsed.toString(16)}` != executionToStore.transactionParametersUsed.nonce) {
			throw new Error(
				`could not handle nonce comversion to number: ${executionToStore.transactionParametersUsed.nonce}`,
			);
		}
		const address = executionToStore.transactionParametersUsed.from;
		const chainId = executionToStore.chainId;
		const nextNonce = nonceUsed + 1;

		const batchOfTransaction: SQLPreparedStatement[] = [];

		try {
			if (updateNonceIfNeeded) {
				const broadcaster = await this.getBroadcaster({
					chainId: executionToStore.chainId,
					address: updateNonceIfNeeded.broadcaster,
				});

				if (!broadcaster) {
					throw new Error(`no broadcaster found`);
				} else if (broadcaster.lock !== updateNonceIfNeeded.lock) {
					throw new Error(`lock not matching: ${updateNonceIfNeeded.lock} (Generated) va ${broadcaster.lock} (DB)`);
				}

				const sqlUpdateNonceStatement = `UPDATE Broadcasters 
				SET 
					nextNonce = MAX(nextNonce, ?1),
					lock = NULL,
					lock_timestamp = NULL
				WHERE 
					address = ?2 AND chainId = ?3`;

				const updateNonceStatement = this.db.prepare(sqlUpdateNonceStatement);
				batchOfTransaction.push(updateNonceStatement.bind(nextNonce, address, chainId));
			}
			if (debtOffset && debtOffset != 0n) {
				const debt_18_offset = debtOffset / 1000000000000000000n;
				const debt_0_offset = debtOffset % 1000000000000000000n;
				// TODO Max is used here to ensure we never go negative debts
				// but this should not be possible in the first place
				const sqlupdateDebt = `UPDATE Broadcasters 
				SET 
					debt_18 = MAX(0, debt_18 + ?1),debt_0 = MAX(0, debt_0 + ?2)
				WHERE 
					address = ?3 AND chainId = ?4`;

				const updateDebt = this.db.prepare(sqlupdateDebt);
				batchOfTransaction.push(updateDebt.bind(debt_18_offset.toString(), debt_0_offset.toString(), address, chainId));
			}
			batchOfTransaction.push(executionInsertionStatement.bind(...values));

			if (asPaymentFor) {
				const helpedForUpToGasPrice = JSON.stringify({
					upToGasPrice: asPaymentFor.helpedForUpToGasPrice.upToGasPrice.toString(),
					valueSent: asPaymentFor.helpedForUpToGasPrice.valueSent.toString(),
				});

				const asPaymentForStatement = this.db.prepare(
					`UPDATE BroadcastedExecutions SET helpedForUpToGasPrice = ?1 WHERE chainId = ?2 AND account = ?3 AND slot = ?4 AND batchIndex = ?5;`,
				);

				batchOfTransaction.push(
					asPaymentForStatement.bind(
						helpedForUpToGasPrice,
						asPaymentFor.chainId,
						asPaymentFor.account,
						asPaymentFor.slot,
						asPaymentFor.batchIndex,
					),
				);
			}

			await this.db.batch(batchOfTransaction);

			// TODO remove
			if (asPaymentFor) {
				const statement = this.db.prepare(
					`SELECT * FROM BroadcastedExecutions WHERE chainId = ?1 AND account = ?2 AND slot = ?3 AND batchIndex = ?4;`,
				);
				const {results} = await statement
					.bind(asPaymentFor.chainId, asPaymentFor.account, asPaymentFor.slot, asPaymentFor.batchIndex)
					.all<ExecutionInDB>();
			}
		} catch (err: any) {
			logger.error(`Failed to update, reset lock...: ${err.message || err}`);
			await this.unlockBroadcaster({address, chainId});
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

	async getAllExecutions(params: {
		limit: number;
		order: 'ASC' | 'DESC';
		// TODO cursor: string //  <nextCheckTime>:<account>:<batchIndex>:<chainId>:<slot>
		//  Uses nextCheckTime as from
		//  then filter out anything before the matching element: <account>:<batchIndex>:<chainId>:<slot>
		//  this assumes the rows are always in the same order, hmmm
		//  also use limit+1 and remove the last element + return the next cursor with that element
	}): Promise<PendingExecutionStored<TransactionDataType>[]> {
		const sqlStatement = `SELECT * FROM BroadcastedExecutions ORDER BY nextCheckTime ${params.order} LIMIT ?1;`;
		const statement = this.db.prepare(sqlStatement);
		const {results} = await statement.bind(params.limit).all<ExecutionInDB>();
		return results.map(fromExecutionInDB<TransactionDataType>);
	}

	// TODO use this to update teh tx
	async getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: IntegerString;
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

	async getBroadcaster(params: {chainId: IntegerString; address: string}): Promise<BroadcasterData | undefined> {
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

	async deleteFinalizedPendingExecutions(params: {chainId?: IntegerString; upTo?: number}): Promise<void> {
		let execution = this.db
			.prepare(`DELETE FROM BroadcastedExecutions WHERE finalized = 1 AND nextCheckTime <= ?1`)
			.bind(params.upTo || Number.MAX_SAFE_INTEGER);
		if (params.chainId) {
			execution = this.db
				.prepare(`DELETE FROM BroadcastedExecutions WHERE finalized = 1 AND nextCheckTime <= ?1 AND chainId = ?2`)
				.bind(params.upTo || Number.MAX_SAFE_INTEGER, params.chainId);
		}

		await execution.all();
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

	async getChainConfiguration(chainId: IntegerString): Promise<ChainConfiguration> {
		const statement = this.db.prepare(`SELECT * FROM ChainConfigurations WHERE chainId = ?1;`);
		const {results} = await statement.bind(chainId).all<ChainConfigurationsInDB>();
		if (results.length === 0) {
			return {};
		} else {
			return fromChainConfigurationsInDB(results[0]);
		}
	}

	async updateExpectedWorstCaseGasPrice(
		chainId: IntegerString,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<ChainConfiguration> {
		const sqlStatement = `INSERT INTO ChainConfigurations (chainId, expectedGasPrice_current, expectedGasPrice_update) 
		 VALUES(?1, ?2, ?3) ON CONFLICT(chainId) DO UPDATE SET
		 expectedGasPrice_previous=expectedGasPrice_current,
		 expectedGasPrice_update=excluded.expectedGasPrice_update,
		 expectedGasPrice_current=excluded.expectedGasPrice_current;`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(chainId, newGasPrice.toString(), timestamp).all();
		return this.getChainConfiguration(chainId);
	}

	async updateFees(chainId: IntegerString, timestamp: number, newFees: Fees): Promise<ChainConfiguration> {
		const sqlStatement = `INSERT INTO ChainConfigurations (chainId, fees_current, fees_update) 
		 VALUES(?1, ?2, ?3) ON CONFLICT(chainId) DO UPDATE SET
		 fees_previous=fees_current,
		 fees_update=excluded.fees_update,
		 fees_current=excluded.fees_current;`;
		const statement = this.db.prepare(sqlStatement);
		await statement.bind(chainId, JSON.stringify(newFees), timestamp).all();
		return this.getChainConfiguration(chainId);
	}
}

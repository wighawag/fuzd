import {logs} from 'named-logs';
import {computePotentialExecutionTime, computeInitialExecutionTimeFromSubmission} from './utils/execution.js';
import {displayExecution} from './utils/debug.js';
import {
	ExecutionStatus,
	QueueProcessingResult,
	ScheduledExecution,
	ScheduleInfo,
	Scheduler,
	SchedulerBackend,
	TimingTypes,
} from './types/external.js';
import {ScheduledExecutionQueued} from './types/scheduler-storage.js';
import {
	ExecutionResponse,
	ExecutionSubmission,
	FUZDLogger,
	IntegerString,
	String0x,
	time2text,
	validateParameters,
	processInGroups,
	resolveProcessingBudget,
	retryDelaySeconds,
} from '@fuzd/common';
import {SchedulerConfig} from './types/internal.js';
import {ChainProtocol, TransactionDataTypes} from '@fuzd/chain-protocol';

function computeScheduledExecutionIdentifier(scheduledExecution: ScheduledExecutionQueued<any>): string {
	return `${scheduledExecution.chainId}/${scheduledExecution.account}/${scheduledExecution.slot}`;
}

const logger = <FUZDLogger>logs('fuzd-scheduler');

/**
 * Create a scheduler instance for a specific TransactionData format
 * The instance contains 2 method:
 * - scheduleExecution: add the provided execution to a queue and send it to the executor for broadcast when times come
 * - processQueue: check the current queue and send any scheduled execution for which the time has come, to the executor
 */
export function createScheduler<ChainProtocolTypes extends ChainProtocol<any>>(
	config: SchedulerConfig<ChainProtocolTypes>,
): Scheduler<TransactionDataTypes<ChainProtocolTypes>> & SchedulerBackend {
	type TransactionDataType = TransactionDataTypes<ChainProtocolTypes>;

	const {chainProtocols, storage, executor} = config;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;
	const processingBudget = resolveProcessingBudget(config.processing);

	async function scheduleExecution(
		account: String0x,
		execution: ScheduledExecution<ExecutionSubmission<TransactionDataType>>,
	): Promise<ScheduleInfo> {
		if (!execution.slot) {
			const errorMessage = `cannot proceed. missing slot`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const chainProtocol = chainProtocols[execution.chainId];
		if (!chainProtocol) {
			const errorMessage = `cannot proceed, this scheduler is not configured to support chain with id ${execution.chainId}`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const realTimestamp = Math.floor(Date.now() / 1000);
		const currentTime = await chainProtocol.getTimestamp();

		const checkinTime = computeInitialExecutionTimeFromSubmission(execution);

		if (checkinTime < currentTime) {
			const errorMessage = `cannot proceed. the expected time to execute is already passed.`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const allowedParameters = await executor.getServiceParameters(execution.chainId);
		if (!validateParameters(execution.executionServiceParameters, allowedParameters, currentTime)) {
			throw new Error(
				`provided parameters do not match the current or previous parameters` +
					JSON.stringify({serviceParameters: execution.executionServiceParameters, allowedParameters}, null, 2),
			);
		}

		// A slot is replaced while nothing of it has been broadcast. Once any of its batch indices has
		// been broadcast the slot is spent: the executor answers slotAlreadyUsed for those indices
		// without sending, so a new schedule into it would answer success and never be sent. Refuse it.
		// (A slot freed by the admin prune routes is indistinguishable from a fresh one, and is accepted.)
		const existing = await storage.getQueuedExecution({chainId: execution.chainId, account, slot: execution.slot});
		const spent =
			existing?.broadcasted ||
			(await executor.getExecutionStatus({chainId: execution.chainId, account, slot: execution.slot})) !== undefined;
		if (spent) {
			const errorMessage = `cannot proceed. the slot (chainId: ${execution.chainId}, account: ${account}, slot: ${execution.slot}) has already been used: its execution has already been broadcast. schedule into a new slot.`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const queuedExecution: ScheduledExecutionQueued<TransactionDataType> = {
			...execution,
			account,
			broadcasted: false,
			finalized: false,
			checkinTime,
			retries: 0,
		};

		// a run holding the slot may be broadcasting it right now (the executor has not stored anything
		// yet, so the check above saw nothing): a schedule accepted then would never be sent
		const queued = await storage.queueExecution(queuedExecution, {now: Date.now()});
		if (!queued.stored) {
			const where = `the slot (chainId: ${execution.chainId}, account: ${account}, slot: ${execution.slot})`;
			const errorMessage =
				queued.reason === 'broadcasted'
					? `cannot proceed. ${where} has already been used: its execution has already been broadcast. schedule into a new slot.`
					: `cannot proceed. ${where} is being processed: its execution may be broadcasting right now. try again in a moment.`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		return {chainId: execution.chainId, slot: execution.slot, account, checkinTime};
	}

	function getExpiryTime(initialTime: number, {timing}: {timing: TimingTypes}): number {
		if (timing.expiryDelta) {
			return initialTime + timing.expiryDelta;
		}

		return initialTime + maxExpiry;
	}

	/**
	 * Replace a time-locked execution's payload and timing by those of its inner layer. The inner timing
	 * decides from then on: the check-in time, and the expiry (from its own initial time). Without an
	 * expiryDelta of its own it keeps the outer one, so peeling a layer never lengthens what the user asked.
	 * A confirmation of the outer timing's prior transaction does not carry over to the inner timing.
	 */
	function peelOuterLayer(
		execution: ScheduledExecutionQueued<TransactionDataType>,
		newPayload: string,
		newTiming: TimingTypes,
	) {
		if (execution.type !== 'time-locked') {
			throw new Error(`only a time-locked execution has layers`);
		}
		if (newTiming.type === 'delta-time') {
			throw new Error(`a time-locked layer cannot have a timing of type "delta-time"`);
		}
		const outerExpiryDelta = execution.timing.expiryDelta;
		execution.payload = newPayload;
		// unset is what getExpiryTime reads as unset (0 and null included): it would mean the 24h maximum
		execution.timing =
			!newTiming.expiryDelta && outerExpiryDelta ? {...newTiming, expiryDelta: outerExpiryDelta} : newTiming;
		execution.priorTransactionConfirmation = undefined;
	}

	/**
	 * The writes of a processing run: they apply only while the run still holds its claim on the
	 * execution. A run stuck past its lease must not undo what another run (or a new schedule) did
	 * since, e.g. write `broadcasted = false` over another run's broadcast (docs/adr/0004).
	 */
	async function writeClaimed(execution: ScheduledExecutionQueued<TransactionDataType>, claimant: string) {
		if (!(await storage.updateClaimedExecution(execution, claimant))) {
			logger.warn(
				`${claimant} no longer holds ${computeScheduledExecutionIdentifier(execution)} (its lease expired, or it was replaced or archived): not written`,
			);
		}
	}

	async function archiveClaimed(execution: ScheduledExecutionQueued<TransactionDataType>, claimant: string) {
		if (!(await storage.archiveClaimedExecution(execution, claimant))) {
			logger.warn(
				`${claimant} no longer holds ${computeScheduledExecutionIdentifier(execution)} (its lease expired, or it was replaced or archived): not archived`,
			);
		}
	}

	async function retryLater(
		execution: ScheduledExecutionQueued<TransactionDataType>,
		newCheckinTime: number,
		claimant: string,
	): Promise<ScheduledExecutionQueued<TransactionDataType>> {
		execution.retries++;
		if (execution.retries >= 100) {
			logger.warn(
				`deleting execution ${computeScheduledExecutionIdentifier(execution)} after ${execution.retries} retries ...`,
			);
			// TODO hook await this._reduceSpending(reveal);
			// TODO archive
			await archiveClaimed(execution, claimant);
		} else {
			execution.checkinTime = newCheckinTime;
			await writeClaimed(execution, claimant);
		}
		return execution;
	}

	/**
	 * Throws when the execution could not be broadcast. The caller (processQueue) records the error
	 * and reschedules it, so that a failing execution never stays at the head of the queue.
	 */
	async function execute(
		scheduledExecutionQueued: ScheduledExecutionQueued<TransactionDataType>,
		currentTimestamp: number,
		claimant: string,
	): Promise<ExecutionStatus> {
		let executions: ExecutionSubmission<TransactionDataType>[];
		if (scheduledExecutionQueued.type === 'time-locked') {
			if (!config.decrypter) {
				const errorMessage = `the scheduler has not been configured with a decrypter. As such it cannot support "time-locked" execution`;
				logger.error(errorMessage);
				throw new Error(errorMessage);
			}

			const decryptionResult = await config.decrypter.decrypt(scheduledExecutionQueued);
			if (decryptionResult.success) {
				executions = decryptionResult.executions;
			} else {
				if (decryptionResult.newPayload && decryptionResult.newTiming) {
					// onion: the decrypted payload is itself time-locked. Keep that inner layer and its timing, so the
					// next attempt decrypts it rather than the outer layer again, and wait for its time.
					peelOuterLayer(scheduledExecutionQueued, decryptionResult.newPayload, decryptionResult.newTiming);
					scheduledExecutionQueued.checkinTime = Math.max(
						computePotentialExecutionTime(scheduledExecutionQueued),
						decryptionResult.retry || 0,
					);
					await writeClaimed(scheduledExecutionQueued, claimant);
					return {type: 'reassigned', reason: 'outer time-lock layer decrypted'};
				} else if (decryptionResult.retry) {
					// a round already past would make it due again at once: give it at least the first retry delay
					scheduledExecutionQueued.checkinTime = Math.max(
						decryptionResult.retry,
						currentTimestamp + retryDelaySeconds(1),
					);
					await writeClaimed(scheduledExecutionQueued, claimant);
					return {type: 'reassigned', reason: 'decryption retry'};
				} else {
					// the decrypter reports any failure this way, a drand request that failed included: retry it
					// later (it is archived once expired, or after 100 retries: about 3h at the 2 minutes cap)
					// rather than leave it due and first in the queue
					logger.warn(`failed to decrypt ${computeScheduledExecutionIdentifier(scheduledExecutionQueued)}`, {
						warning: {
							data: decryptionResult,
						},
					});
					throw new Error(`failed to decrypt`);
				}
			}
		} else {
			executions = scheduledExecutionQueued.executions;
		}

		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

		let initialTime: number;
		if (scheduledExecutionQueued.timing.type === 'delta-time') {
			initialTime =
				(scheduledExecutionQueued.priorTransactionConfirmation?.blockTime ||
					scheduledExecutionQueued.timing.startTransaction.broadcastTime) + scheduledExecutionQueued.timing.delta;
		} else if (scheduledExecutionQueued.timing.type === 'delta-time-with-target-time') {
			initialTime =
				(scheduledExecutionQueued.priorTransactionConfirmation?.blockTime ||
					scheduledExecutionQueued.timing.startTransaction.broadcastTime) + scheduledExecutionQueued.timing.delta;
			if (scheduledExecutionQueued.timing.targetTimeUnlessHigherDelta > initialTime) {
				initialTime = scheduledExecutionQueued.timing.targetTimeUnlessHigherDelta;
			}
		} else if (scheduledExecutionQueued.timing.type === 'fixed-round') {
			initialTime = scheduledExecutionQueued.timing.expectedTime;
		} else if (scheduledExecutionQueued.timing.type === 'fixed-time') {
			initialTime = scheduledExecutionQueued.timing.scheduledTime;
		} else {
			const errorMessage = `unknown timing type: ${(scheduledExecutionQueued.timing as any).type}`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		const expiryTime = getExpiryTime(initialTime, scheduledExecutionQueued);

		try {
			const results: ExecutionResponse<TransactionDataType>[] = [];
			for (let i = 0; i < executions.length; i++) {
				const execution = executions[i];
				const executionResult = await executor.broadcastExecution(
					scheduledExecutionQueued.slot,
					i, // batchIndex
					scheduledExecutionQueued.account,
					execution,
					scheduledExecutionQueued.executionServiceParameters, // we pass what was there on scheduling time
					{
						trusted: true,
						onBehalf: scheduledExecutionQueued.onBehalf,
						expiryTime,
						initialTime,
					}, // The scheduler is trusted to have verified the exectuion parameters
				);
				results.push(executionResult);
			}

			// A result with slotAlreadyUsed is expected here: it is a retry of this same record after an
			// earlier run broadcast some of its indices and then failed (or crashed) before the write
			// below, and the executor does not send those indices again. A DIFFERENT record meets it in
			// two cases only: a direct broadcastExecution (the executor's API) into a slot the scheduler
			// holds queued, which nothing refuses; and a schedule landing in the milliseconds between
			// scheduleExecution's executor check and its write, while a run that just broadcast part of
			// the slot and failed writes it back. (scheduleExecution refuses a slot a run holds.)

			// if we reaches there, the execution is now handled by the executor
			// the schedule has done its job
			// if for some reason `executor.broadcastExecution(...)` fails to return but has actually broadcasted the tx
			// the scheduler will attempt again. the id tell the executor to not reexecute
			scheduledExecutionQueued.broadcasted = true;
			await writeClaimed(scheduledExecutionQueued, claimant);

			return {
				type: 'broadcasted',
				reason: `broadcasted via txs ${results && results.map((v) => (v as any).hash).join(',')}`,
			};
		} catch (err: any) {
			logger.error(
				`failed to broadcast ${computeScheduledExecutionIdentifier(scheduledExecutionQueued)}: ${err.message || err}`,
			);
			throw err;
		}
	}

	function _getChainProtocol(chainId: IntegerString): ChainProtocol<any> {
		const chainProtocol = chainProtocols[chainId];
		if (!chainProtocol) {
			const errorMessage = `cannot get protocol for chain with id ${chainId}`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		return chainProtocol;
	}

	async function checkAndUpdateExecutionIfNeeded(
		execution: ScheduledExecutionQueued<TransactionDataType>,
		currentTimestamp: number,
		claimant: string,
	): Promise<
		| {status: 'deleted'} // TODO remove ? (not used for now)
		| {status: 'archived'}
		| {status: 'changed'; execution: ScheduledExecutionQueued<TransactionDataType>}
		| {status: 'unchanged'; execution: ScheduledExecutionQueued<TransactionDataType>}
		| {status: 'willRetry'; execution: ScheduledExecutionQueued<TransactionDataType>}
	> {
		const chainProtocol = _getChainProtocol(execution.chainId);
		const {expectedFinality, worstCaseBlockTime} = chainProtocol.config;
		// TODO callback for balance checks ?

		const timing = execution.timing;
		switch (timing.type) {
			case 'fixed-time':
			case 'fixed-round':
				if (timing.type === 'fixed-round') {
					if (currentTimestamp < timing.expectedTime) {
						return {status: 'unchanged', execution};
					}
				} else {
					if (currentTimestamp < timing.scheduledTime) {
						return {status: 'unchanged', execution};
					}
				}
				if (timing.assumedTransaction && !execution.priorTransactionConfirmation) {
					const txStatus = await chainProtocol.getTransactionStatus(timing.assumedTransaction);
					if (!txStatus.success) {
						logger.error(
							`could not get the assumed transaction (${timing.assumedTransaction.hash} / ${timing.assumedTransaction.broadcastTime}) status: ${txStatus.error.message || txStatus.error}`,
						);
						throw txStatus.error;
					}
					if (!txStatus.finalised) {
						logger.warn(
							`the tx the execution depends on (${timing.assumedTransaction.hash} / ${timing.assumedTransaction.broadcastTime})  has not finalised and the timestamp has already passed`,
						);
						// TODO should we delete ?
						// or retry later ?
						// TODO archive in any case
						await archiveClaimed(execution, claimant);
						return {status: 'archived'};
					} else {
						if (txStatus.status == 'failed') {
							logger.warn(
								`deleting the execution as the tx it depends on (${timing.assumedTransaction.hash} / ${timing.assumedTransaction.broadcastTime})  ${txStatus.status == 'failed' ? 'failed' : 'was replaced'}...`,
							);
							// TODO archive
							await archiveClaimed(execution, claimant);
							return {status: 'archived'};
						} else if (txStatus.status === 'replaced') {
							logger.warn(`prior tx (${timing.assumedTransaction.hash}) has been replaced`);
							// what to do if replaced ? //  || txStatus.status == 'replaced'
							// we do not want to delete as it could be replaced by player....
							return {status: 'unchanged', execution};
						}
						// we do not really need to store that, we can skip it and simply execute
						execution.priorTransactionConfirmation = {
							blockTime: txStatus.blockTime,
						};
						// TODO we are good to go
						return {status: 'changed', execution};
					}
				} else {
					return {status: 'unchanged', execution};
				}
			case 'delta-time-with-target-time':
			case 'delta-time':
				if (!execution.priorTransactionConfirmation) {
					const txStatus = await chainProtocol.getTransactionStatus(timing.startTransaction);
					if (!txStatus.success) {
						logger.error(
							`could not get the prior transaction (${timing.startTransaction.hash} / ${timing.startTransaction.broadcastTime}) status: ${txStatus.error.message || txStatus.error}`,
						);
						throw txStatus.error;
					}
					if (!txStatus.finalised) {
						if (currentTimestamp > timing.startTransaction.broadcastTime + expectedFinality * worstCaseBlockTime) {
							logger.warn(
								`prior tx (${timing.startTransaction.hash} / ${timing.startTransaction.broadcastTime}) not yet finalized, will retry later...`,
							);
						}

						const newCheckinTime = computePotentialExecutionTime(execution, {
							startTimeToCountFrom: txStatus.blockTime || currentTimestamp,
						});
						const executionToRetry = await retryLater(execution, newCheckinTime, claimant);
						return {status: 'willRetry', execution: executionToRetry};
					} else {
						if (txStatus.status == 'failed') {
							logger.warn(
								`deleting the execution as the tx it depends on (${timing.startTransaction.hash} / ${timing.startTransaction.broadcastTime}) ${txStatus.status == 'failed' ? 'failed' : 'was replaced'}...`,
							);
							// TODO archive
							await archiveClaimed(execution, claimant);
							return {status: 'archived'};
						} else if (txStatus.status === 'replaced') {
							logger.warn(`prior tx (${timing.startTransaction.hash}) has been replaced`);
							// what to do if replaced ? //  || txStatus.status == 'replaced'
							// we do not want to delete as it could be replaced by player....
							return {status: 'unchanged', execution};
						}
						// TODO implement event expectation with params extraction
						// if (execution.timing.startTransaction.expectEvent) {
						// 	// for (const log of receipt.logs) {
						// 	// 	log.
						// 	// }
						// 	// if event then continue and extract param
						// 	// else delete as the tx has not been doing what it was supposed to do
						// }

						execution.priorTransactionConfirmation = {
							blockTime: txStatus.blockTime,
						};
						// TODO we are good to go
						return {status: 'changed', execution};
					}
				} else {
					return {status: 'unchanged', execution};
				}
		}
	}

	async function processExecution(
		execution: ScheduledExecutionQueued<TransactionDataType>,
		result: QueueProcessingResult,
		claimant: string,
	) {
		const chainIdDecimal = Number(execution.chainId).toString();
		const chainProtocol = _getChainProtocol(execution.chainId);
		const {expectedFinality, worstCaseBlockTime} = chainProtocol.config;

		// Note here that if the service use a contract timestamp or a network who has its own deviating timestamp
		// then the system mostyl assume that only one of such network/contract is being used
		// Otherwise, tx ordering will affect the priority of these tx
		// this is because tx using normal time will always be fetched first
		// an option to processQueue only with specific contract/network could be used
		// or alternatively a startTime option to diregard past transaction
		// but this comes with its own risk.

		// timestamp cache
		// TODO add real time offset to it
		let currentTimestamp = result.chainTimestamps[chainIdDecimal];
		if (!currentTimestamp) {
			currentTimestamp = await chainProtocol.getTimestamp();
			result.chainTimestamps[chainIdDecimal] = currentTimestamp;
		}

		if (!currentTimestamp) {
			logger.error(`no currentTimestamp: ${currentTimestamp}`);
		}

		const updates = await checkAndUpdateExecutionIfNeeded(execution, currentTimestamp, claimant);
		if (updates.status === 'archived' || updates.status === 'willRetry' || updates.status === 'deleted') {
			let status: ExecutionStatus;
			if (updates.status === 'deleted') {
				status = {
					type: 'deleted',
					reason: 'udpates deleted',
				};
			} else if (updates.status === 'archived') {
				status = {
					type: 'archived',
					reason: 'udpates archived',
				};
			} else {
				status = {
					type: 'reassigned',
					reason: 'updates willRetry',
				};
			}
			result.executions.push({
				chainId: execution.chainId,
				account: execution.account,
				slot: execution.slot,
				checkinTime: execution.checkinTime,
				status,
			});
			return;
		}

		const executionUpdated = updates.execution;
		const newCheckinTime = computePotentialExecutionTime(executionUpdated, {
			lastCheckin: currentTimestamp,
		});

		const expiryTime = getExpiryTime(newCheckinTime, executionUpdated);

		if (currentTimestamp > expiryTime + expectedFinality * worstCaseBlockTime) {
			// delete if execution expired
			logger.warn(`too late, archiving ${computeScheduledExecutionIdentifier(execution)}...`);
			await archiveClaimed(execution, claimant);
			result.executions.push({
				chainId: execution.chainId,
				account: execution.account,
				slot: execution.slot,
				checkinTime: execution.checkinTime,
				status: {type: 'archived', reason: 'too late'},
			});
			return;
		}

		if (currentTimestamp >= newCheckinTime) {
			// execute if it is the time
			const status = await execute(executionUpdated, currentTimestamp, claimant);
			result.executions.push({
				chainId: execution.chainId,
				account: execution.account,
				slot: execution.slot,
				checkinTime: execution.checkinTime,
				status,
			});
		} else {
			// if not, then in most case we detected a change in the execution time
			if (updates.status === 'changed') {
				await writeClaimed(executionUpdated, claimant);
				result.executions.push({
					chainId: execution.chainId,
					account: execution.account,
					slot: execution.slot,
					checkinTime: execution.checkinTime,
					status: {type: 'reassigned', reason: 'changed'},
				});
			} else {
				// For now as we do not limit result to a certain time, we will reach there often
				// (not written back: the run releases its claim when it ends, docs/adr/0004)
				logger.debug(`not yet time: ${time2text(newCheckinTime - currentTimestamp)} to wait...`);
				result.executions.push({
					chainId: execution.chainId,
					account: execution.account,
					slot: execution.slot,
					checkinTime: execution.checkinTime,
					status: {type: 'skipped', reason: 'not yet time'},
				});
			}
		}
	}

	/**
	 * An execution whose processing threw (the executor refused it, an RPC or drand request failed)
	 * keeps its error and is retried after a delay growing with its retries. Leaving it as it was would
	 * keep it first in the queue, and enough of them would starve every other execution.
	 */
	async function retryAfterFailure(
		execution: ScheduledExecutionQueued<TransactionDataType>,
		error: any,
		result: QueueProcessingResult,
		claimant: string,
	) {
		const identifier = computeScheduledExecutionIdentifier(execution);
		execution.lastError = (error && (error.message || error.toString())) || 'unknown error';
		logger.error(`Processing of execution ${identifier} thrown an exception: ${execution.lastError}`);
		const currentTimestamp =
			result.chainTimestamps[Number(execution.chainId).toString()] || Math.floor(Date.now() / 1000);
		const delay = retryDelaySeconds(execution.retries + 1);
		try {
			await retryLater(execution, currentTimestamp + delay, claimant);
			result.executions.push({
				chainId: execution.chainId,
				account: execution.account,
				slot: execution.slot,
				checkinTime: execution.checkinTime,
				status:
					execution.retries >= 100
						? {type: 'archived', reason: `failed ${execution.retries} times: ${execution.lastError}`}
						: {type: 'reassigned', reason: `failed, retry in ${delay}s: ${execution.lastError}`},
			});
		} catch (retryError: any) {
			logger.error(`could not reschedule ${identifier}: ${retryError.message || retryError}`);
		}
	}

	/**
	 * Process the executions that are due, chain by chain: batches of due executions are claimed and
	 * processed until none is left or the processing budget is spent. Executions of different accounts
	 * run concurrently, those of one account one after the other (they share a broadcaster and its nonce).
	 *
	 * Runs may overlap (several crons, loops or processes on one database): each batch is claimed by
	 * this run only, for `leaseDurationMs`, and released as each execution is written back
	 * (docs/adr/0004-claim-due-items-with-a-lease.md). An account another run holds an execution of
	 * is left out of a claim, so the executions of one account are sent by one run at a time, in order.
	 */
	async function processQueue() {
		const budget = processingBudget;
		const result: QueueProcessingResult = {
			limit: budget.maxItemsPerRun,
			executions: [],
			chainTimestamps: {},
			budgetExhausted: false,
		};
		const start = Date.now();
		const claimant = `processQueue:${crypto.randomUUID()}`;
		let claimed = false;
		const seen = new Set<string>();
		let processed = 0;
		const withinBudget = () => processed < budget.maxItemsPerRun && Date.now() - start < budget.maxDurationPerRunMs;

		try {
			for (const chainId of Object.keys(chainProtocols) as IntegerString[]) {
				if (!withinBudget()) {
					result.budgetExhausted = true;
					break;
				}
				let currentTimestamp: number;
				try {
					currentTimestamp = await _getChainProtocol(chainId).getTimestamp();
				} catch (err: any) {
					logger.error(`could not get the timestamp of chain ${chainId}, skipping it: ${err.message || err}`);
					continue;
				}
				result.chainTimestamps[Number(chainId).toString()] = currentTimestamp;

				for (;;) {
					if (!withinBudget()) {
						result.budgetExhausted = true;
						break;
					}
					const limit = Math.min(budget.batchSize, budget.maxItemsPerRun - processed);
					const now = Date.now();
					const executions = await storage.claimDueExecutions({
						limit,
						chainId,
						upToCheckinTime: currentTimestamp,
						claim: {by: claimant, now, expiresAt: now + budget.leaseDurationMs},
					});
					claimed = claimed || executions.length > 0;
					// an execution handled earlier in this run and still due made no progress: not again in this run
					// (its claim is released at the end of the run)
					const fresh = executions.filter((v) => !seen.has(computeScheduledExecutionIdentifier(v)));
					if (fresh.length === 0) {
						break;
					}
					for (const execution of fresh) {
						seen.add(computeScheduledExecutionIdentifier(execution));
					}
					processed += fresh.length;

					await processInGroups(
						fresh,
						(execution) => `${execution.chainId}/${execution.account}`,
						budget.concurrency,
						async (execution) => {
							try {
								await processExecution(execution, result, claimant);
							} catch (err: any) {
								await retryAfterFailure(execution, err, result, claimant);
							}
						},
					);

					if (executions.length < limit) {
						// that was every claimable due execution of this chain
						break;
					}
				}
			}
		} finally {
			if (claimed) {
				// what this run still holds (not written back: skipped, or its write failed) is free again now,
				// rather than when the lease expires
				try {
					await storage.releaseExecutionClaims(claimant);
				} catch (err: any) {
					logger.error(`could not release the claims of ${claimant}, they expire on their own: ${err.message || err}`);
				}
			}
		}

		if (processed > 0) {
			logger.info(`processed ${processed} executions in ${Date.now() - start}ms`);
		}
		return result;
	}

	/**
	 * Mark finalized the broadcast executions whose transactions the executor has finalized: chain by
	 * chain, configured chains only (the executor finalizes the transactions of those only, so the
	 * rows of a chain no longer configured would otherwise take every place), in batches of
	 * `batchSize`, each read, checked and written in a few statements. Each chain gets up to
	 * `maxNumTransactionsToProcessInOneGo` executions per run, so one whose transactions are slow to
	 * finalize never keeps the others from being looked at; `maxDurationPerRunMs` bounds the run.
	 *
	 * Every run starts again from the oldest, and pages past the ones not final yet. It reports
	 * `budgetExhausted` only when a chain's share, or the run's time, ran out while it was finalizing
	 * at least a batch's worth: the next run then gets further, while one that finalized few would
	 * mostly read the same executions again (a processing loop would spin on it while transactions
	 * wait for finality).
	 */
	async function checkScheduledExecutionStatus(): Promise<QueueProcessingResult> {
		const limit = maxNumTransactionsToProcessInOneGo;
		const budget = processingBudget;
		const result: QueueProcessingResult = {
			limit,
			executions: [],
			chainTimestamps: {},
			budgetExhausted: false,
		};
		const start = Date.now();
		// more to do at once: a chain whose share was spent while it was making progress, or chains the
		// run had no time for after making progress
		let more = false;
		let finalized = 0;
		let outOfTime = false;

		for (const chainId of Object.keys(chainProtocols) as IntegerString[]) {
			let after: {checkinTime: number; account: String0x; slot: string} | undefined;
			let checked = 0;
			let finalizedOnChain = 0;
			for (;;) {
				if (Date.now() - start >= budget.maxDurationPerRunMs) {
					outOfTime = true;
					break;
				}
				const batchLimit = Math.min(budget.batchSize, limit - checked);
				let executions: ScheduledExecutionQueued<TransactionDataType>[];
				try {
					executions = await storage.getUnFinalizedBroadcastedScheduledExecutions({
						limit: batchLimit,
						chainId,
						after,
					});
				} catch (err: any) {
					logger.error(`could not read the broadcast executions of chain ${chainId}: ${err?.message || err}`);
					break;
				}
				if (executions.length === 0) {
					break;
				}
				const last = executions[executions.length - 1];
				after = {checkinTime: last.checkinTime, account: last.account, slot: last.slot};
				checked += executions.length;

				let statuses: ExecutionStatus[];
				try {
					const fromExecutor = await executor.getExecutionStatuses(chainId, executions);
					const toFinalize = executions.filter((_, i) => fromExecutor[i] === 'finalized');
					// only the flag, and only while still broadcast: a new schedule written into a slot since
					// this run read it must not be overwritten by the old record
					const marked = await storage.markExecutionsFinalized({chainId, slots: toFinalize});
					const markedKeys = new Set(marked.map((v) => `${v.account.toLowerCase()}/${v.slot}`));
					finalized += marked.length;
					finalizedOnChain += marked.length;
					statuses = executions.map((execution, i): ExecutionStatus => {
						if (fromExecutor[i] !== 'finalized') {
							return {type: 'broadcasted', reason: 'queried'};
						}
						return markedKeys.has(`${execution.account.toLowerCase()}/${execution.slot}`)
							? {type: 'finalized', reason: 'queried'}
							: {type: 'unknown', reason: 'replaced since it was read'};
					});
				} catch (err: any) {
					// a batch whose check fails must not stop the others; it is looked at again at the next run
					logger.error(`could not check the status of ${executions.length} executions of chain ${chainId}`, err);
					const failure: ExecutionStatus = {type: 'unknown', reason: `failed to check: ${err?.message || err}`};
					statuses = executions.map(() => failure);
				}

				executions.forEach((execution, i) =>
					result.executions.push({
						chainId: execution.chainId,
						account: execution.account,
						slot: execution.slot,
						checkinTime: execution.checkinTime,
						status: statuses[i],
					}),
				);
				if (executions.length < batchLimit) {
					// that was every broadcast execution of this chain not finalized yet
					break;
				}
				if (checked >= limit) {
					// this chain's share of the run is spent, and more may be left
					more = more || finalizedOnChain >= budget.batchSize;
					break;
				}
			}
			if (outOfTime || Date.now() - start >= budget.maxDurationPerRunMs) {
				outOfTime = true;
				break;
			}
		}

		result.budgetExhausted = more || (outOfTime && finalized >= budget.batchSize);
		return result;
	}

	return {
		scheduleExecution,
		processQueue,
		checkScheduledExecutionStatus,
	};
}

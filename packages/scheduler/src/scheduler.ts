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
} from './types/external.js';
import {ScheduledExecutionQueued} from './types/scheduler-storage.js';
import {
	ExecutionResponse,
	ExecutionSubmission,
	IntegerString,
	String0x,
	time2text,
	validateParameters,
} from 'fuzd-common';
import {SchedulerConfig} from './types/internal.js';
import {ChainProtocol, TransactionDataTypes} from 'fuzd-chain-protocol';

const logger = logs('fuzd-scheduler');

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
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

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

		const queuedExecution: ScheduledExecutionQueued<TransactionDataType> = {
			...execution,
			account,
			broadcasted: false,
			finalized: false,
			checkinTime,
			retries: 0,
		};

		await storage.createOrUpdateQueuedExecution(queuedExecution);
		return {chainId: execution.chainId, slot: execution.slot, account, checkinTime};
	}

	async function retryLater(
		execution: ScheduledExecutionQueued<TransactionDataType>,
		newCheckinTime: number,
	): Promise<ScheduledExecutionQueued<TransactionDataType>> {
		execution.retries++;
		if (execution.retries >= 100) {
			logger.warn(
				`deleting execution (chainid: ${execution.chainId}, account: ${execution.slot}, slot: ${execution.slot}) after ${execution.retries} retries ...`,
			);
			// TODO hook await this._reduceSpending(reveal);
			// TODO archive
			await storage.archiveExecution(execution);
		} else {
			execution.checkinTime = newCheckinTime;
			await storage.createOrUpdateQueuedExecution(execution);
		}
		return execution;
	}

	async function execute(
		scheduledExecutionQueued: ScheduledExecutionQueued<TransactionDataType>,
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
				if (decryptionResult.retry) {
					scheduledExecutionQueued.checkinTime = decryptionResult.retry;
					await storage.createOrUpdateQueuedExecution(scheduledExecutionQueued);
					return {type: 'reassigned', reason: 'decryption retry'};
				} else {
					// failed to decrypt and no retry, this means the decryption is failing
					// TODO
					// await storage.archiveExecution(execution);
					logger.warn('failed to decrypt', decryptionResult);
					return {type: 'archived', reason: 'failed to decrypt'};
				}
			}
		} else {
			executions = scheduledExecutionQueued.executions;
		}

		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

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
						expiryTime: scheduledExecutionQueued.timing.expiry,
					}, // The scheduler is trusted to have verified the exectuion parameters
				);
				results.push(executionResult);
			}

			// TODO if trying to execute different data when previous tx is already broadcasted: we should throw here
			// because now the executor skip it

			// if we reaches there, the execution is now handled by the executor
			// the schedule has done its job
			// if for some reason `executor.broadcastExecution(...)` fails to return but has actually broadcasted the tx
			// the scheduler will attempt again. the id tell the executor to not reexecute
			scheduledExecutionQueued.broadcasted = true;
			await storage.createOrUpdateQueuedExecution(scheduledExecutionQueued);

			return {
				type: 'broadcasted',
				reason: `broadcasted via txs ${results && results.map((v) => (v as any).hash).join(',')}`,
			};
		} catch (err: any) {
			scheduledExecutionQueued.lastError = err.message || err.toString();

			await storage.createOrUpdateQueuedExecution(scheduledExecutionQueued);
			logger.error(`failed to broadcast: ${scheduledExecutionQueued.lastError}`);
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
				if (timing.assumedTransaction && !execution.priorTransactionConfirmation) {
					const txStatus = await chainProtocol.getTransactionStatus(timing.assumedTransaction);
					if (!txStatus.success) {
						logger.error(`could not get the assumed transaction status: ${txStatus.error.message || txStatus.error}`);
						throw txStatus.error;
					}
					if (!txStatus.finalised) {
						logger.warn(`the tx the execution depends on has not finalised and the timestamp has already passed`);
						// TODO should we delete ?
						// or retry later ?
						// TODO archive in any case
						await storage.archiveExecution(execution);
						return {status: 'archived'};
					} else {
						if (txStatus.failed) {
							logger.warn(`deleting the execution as the tx it depends on failed...`);
							// TODO archive
							await storage.archiveExecution(execution);
							return {status: 'archived'};
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
			case 'delta-time':
				if (!execution.priorTransactionConfirmation) {
					const txStatus = await chainProtocol.getTransactionStatus(timing.startTransaction);
					if (!txStatus.success) {
						logger.error(`could not get the prior transaction status: ${txStatus.error.message || txStatus.error}`);
						throw txStatus.error;
					}
					if (!txStatus.finalised) {
						logger.warn(`prior tx not yet finalized, will retry later...`);
						const newCheckinTime = computePotentialExecutionTime(execution, {
							startTimeToCountFrom: txStatus.blockTime || currentTimestamp,
						});
						const executionToRetry = await retryLater(execution, newCheckinTime);
						return {status: 'willRetry', execution: executionToRetry};
					} else {
						if (txStatus.failed) {
							logger.warn(`deleting the execution as the tx it depends on failed...`);
							// TODO archive
							await storage.archiveExecution(execution);
							return {status: 'archived'};
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

		let currentTimestamp = result.chainTimestamps[chainIdDecimal];
		if (!currentTimestamp) {
			currentTimestamp = await chainProtocol.getTimestamp();
			result.chainTimestamps[chainIdDecimal] = currentTimestamp;
		}

		if (!currentTimestamp) {
			logger.error(`currentTimestamp: ${currentTimestamp}`);
		}

		const updates = await checkAndUpdateExecutionIfNeeded(execution, currentTimestamp);
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

		if (
			currentTimestamp >
			newCheckinTime +
				Math.min(executionUpdated.timing.expiry || Number.MAX_SAFE_INTEGER, maxExpiry) +
				expectedFinality * worstCaseBlockTime
		) {
			// delete if execution expired
			logger.warn(`too late, archiving ${displayExecution(execution)}...`);
			await storage.archiveExecution(execution);
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
			const status = await execute(executionUpdated);
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
				await storage.createOrUpdateQueuedExecution(executionUpdated);
				result.executions.push({
					chainId: execution.chainId,
					account: execution.account,
					slot: execution.slot,
					checkinTime: execution.checkinTime,
					status: {type: 'reassigned', reason: 'changed'},
				});
			} else {
				// For now as we do not limit result to a certain time, we will reach there often
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

	async function processQueue() {
		const limit = maxNumTransactionsToProcessInOneGo;
		const result: QueueProcessingResult = {
			limit,
			executions: [],
			chainTimestamps: {},
		};

		// TODO only query up to a certain time
		const executions = await storage.getQueueTopMostExecutions({limit});

		if (executions.length === 0) {
			// logger.info(`found zero executions to process`);
		} else if (executions.length === 1) {
			// logger.info(`found 1 queued execution for ${executions[0].checkinTime}`);
		} else {
			// logger.info(
			// 	`found ${executions.length} queued execution from ${executions[0].checkinTime} to ${
			// 		executions[executions.length - 1].checkinTime
			// 	}`,
			// );
		}

		for (const execution of executions) {
			try {
				await processExecution(execution, result);
			} catch (processExecutionError: any) {
				logger.error(
					`Processing of execution "${execution.chainId}_${execution.account}_${execution.slot}" thrown an exception: ${processExecutionError.message || processExecutionError}`,
				);

				// TODO ?
				// logger.info(`we ll push to 5 min later`)
				// execution.checkinTime += 5 * 60;
				// await storage.createOrUpdateQueuedExecution(execution);
				// result.executions.push({
				// 	chainId: execution.chainId,
				// 	account: execution.account,
				// 	slot: execution.slot,
				// 	checkinTime: execution.checkinTime,
				// 	status: {type: 'reassigned', reason: 'changed'},
				// });
			}
		}

		return result;
	}

	async function checkScheduledExecutionStatus(): Promise<QueueProcessingResult> {
		const limit = maxNumTransactionsToProcessInOneGo;
		const result: QueueProcessingResult = {
			limit,
			executions: [],
			chainTimestamps: {},
		};

		const executions = await storage.getUnFinalizedBroadcastedScheduledExecutions({limit});

		if (executions.length === 0) {
			// logger.info(`found zero executions to process`);
		} else if (executions.length === 1) {
			// logger.info(`found 1 queued execution for ${executions[0].checkinTime}`);
		} else {
			// logger.info(
			// 	`found ${executions.length} queued execution from ${executions[0].checkinTime} to ${
			// 		executions[executions.length - 1].checkinTime
			// 	}`,
			// );
		}

		for (const execution of executions) {
			const status = await executor.getExecutionStatus(execution);
			let statusToReport: 'broadcasted' | 'unknown' | 'finalized' = status ? 'broadcasted' : 'unknown';
			if (status === 'finalized') {
				execution.finalized = true;
				await storage.createOrUpdateQueuedExecution(execution);
				statusToReport = 'finalized';
			}

			result.executions.push({
				chainId: execution.chainId,
				account: execution.account,
				slot: execution.slot,
				checkinTime: execution.checkinTime,
				status: {
					type: statusToReport,
					reason: 'queried',
				},
			});
		}

		return result;
	}

	return {
		scheduleExecution,
		processQueue,
		checkScheduledExecutionStatus,
	};
}

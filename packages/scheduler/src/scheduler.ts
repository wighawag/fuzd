import {logs} from 'named-logs';
import {EIP1193Account} from 'eip-1193';
import {computePotentialExecutionTime, computeFirstExecutionTimeFromSubmission} from './utils/execution';
import {displayExecution} from './utils/debug';
import {
	ExecutionStatus,
	QueueProcessingResult,
	ScheduledExecution,
	ScheduleInfo,
	Scheduler,
	SchedulerBackend,
} from './types/external';
import {ExecutionQueued} from './types/scheduler-storage';
import {getTransactionStatus, time2text} from 'fuzd-common';
import {ChainConfig, SchedulerConfig} from './types/internal';

const logger = logs('fuzd-scheduler');

/**
 * Create a scheduler instance for a specific TransactionData format
 * The instance contains 2 method:
 * - submitExecution: add the provided execution to a queue and send it to the executor for broadcast when times come
 * - processQueue: check the current queue and send any scheduled execution for which the time has come, to the executor
 */
export function createScheduler<TransactionDataType, TransactionInfoType>(
	config: SchedulerConfig<TransactionDataType, TransactionInfoType>,
): Scheduler<TransactionDataType> & SchedulerBackend {
	const {chainConfigs, time, storage, executor} = config;
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	async function submitExecution(
		account: EIP1193Account,
		execution: ScheduledExecution<TransactionDataType>,
	): Promise<ScheduleInfo> {
		if (!execution.slot) {
			throw new Error(`cannot proceed. missing slot`);
		}

		const chainConfig = chainConfigs[execution.chainId];
		if (!chainConfig) {
			throw new Error(`cannot proceed, this scheduler is not configured to support chain with id ${execution.chainId}`);
		}

		const currentTime = await time.getTimestamp(chainConfig.provider);

		const checkinTime = computeFirstExecutionTimeFromSubmission(execution);

		if (checkinTime < currentTime) {
			throw new Error(`cannot proceed. the expected time to execute is already passed.`);
		}

		const queuedExecution: ExecutionQueued<TransactionDataType> = {
			...execution,
			account,
			checkinTime,
			retries: 0,
		};

		await storage.createOrUpdateQueuedExecution(queuedExecution);
		return {chainId: execution.chainId, slot: execution.slot, account, checkinTime};
	}

	async function retryLater(
		execution: ExecutionQueued<TransactionDataType>,
		newCheckinTime: number,
	): Promise<ExecutionQueued<TransactionDataType>> {
		execution.retries++;
		if (execution.retries >= 100) {
			logger.info(
				`deleting execution (chainid: ${execution.chainId}, account: ${execution.slot}, slot: ${execution.slot}) after ${execution.retries} retries ...`,
			);
			// TODO hook await this._reduceSpending(reveal);
			// TODO archive
			await storage.deleteExecution(execution);
		} else {
			execution.checkinTime = newCheckinTime;
			await storage.createOrUpdateQueuedExecution(execution);
		}
		return execution;
	}

	async function execute(execution: ExecutionQueued<TransactionDataType>): Promise<ExecutionStatus> {
		let transactions: TransactionDataType[];
		if (execution.type === 'time-locked') {
			if (!config.decrypter) {
				throw new Error(
					`the scheduler has not been configured with a decrypter. As such it cannot support "time-locked" execution`,
				);
			}

			const decryptionResult = await config.decrypter.decrypt(execution);
			if (decryptionResult.success) {
				transactions = decryptionResult.transactions;
			} else {
				if (decryptionResult.retry) {
					execution.checkinTime = decryptionResult.retry;
					await storage.createOrUpdateQueuedExecution(execution);
					return {type: 'reassigned', reason: 'decryption retry'};
				} else {
					// failed to decrypt and no retry, this means the decryption is failing
					// TODO
					// await storage.deleteExecution(execution);
					logger.info(decryptionResult);
					return {type: 'deleted', reason: 'failed to decrypt'};
				}
			}
		} else {
			transactions = execution.transactions;
		}

		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

		const results: TransactionInfoType[] = [];
		for (const transaction of transactions) {
			const executionResult = await executor.submitTransaction(execution.slot, execution.account, transaction);
			results.push(executionResult);
		}

		// TODO if trying to execute different data when previous tx is already broadcasted: we should throw here
		// because now the executor skip it

		// if we reaches there, the execution is now handled by the executor
		// the schedule has done its job
		// if for some reason `executor.submitTransactions(...)` fails to return but has actually broadcasted the tx
		// the scheduler will attempt again. the id tell the executor to not reexecute
		await storage.deleteExecution(execution);

		return {
			type: 'broadcasted',
			reason: `broadcasted via txs ${results && results.map((v) => (v as any).hash).join(',')}`,
		};
	}

	function _getChainConfig(chainId: `0x${string}`): ChainConfig {
		const chainConfig = chainConfigs[chainId];
		if (!chainConfig) {
			throw new Error(`cannot get config for chain with id ${chainId}`);
		}
		return chainConfig;
	}

	async function checkAndUpdateExecutionIfNeeded(
		execution: ExecutionQueued<TransactionDataType>,
		currentTimestamp: number,
	): Promise<
		| {status: 'deleted'}
		| {status: 'changed'; execution: ExecutionQueued<TransactionDataType>}
		| {status: 'unchanged'; execution: ExecutionQueued<TransactionDataType>}
		| {status: 'willRetry'; execution: ExecutionQueued<TransactionDataType>}
	> {
		const {provider, finality, worstCaseBlockTime} = _getChainConfig(execution.chainId);
		// TODO callback for balance checks ?

		if (execution.timing.type === 'fixed') {
			if (execution.timing.assumedTransaction && !execution.timing.assumedTransaction.confirmed) {
				const txStatus = await getTransactionStatus(provider, execution.timing.assumedTransaction, finality);

				if (!txStatus.finalised) {
					logger.debug(`the tx the execution depends on has not finalised and the timestamp has already passed`);
					// TODO should we delete ?
					// or retry later ?
					// TODO archive in any case
					await storage.deleteExecution(execution);
					return {status: 'deleted'};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
						// TODO archive
						await storage.deleteExecution(execution);
						return {status: 'deleted'};
					}
					// we do not really need to store that, we can skip it and simply execute
					execution.timing.assumedTransaction.confirmed = {
						blockTime: txStatus.blockTime,
					};
					// TODO we are good to go
					return {status: 'changed', execution};
				}
			} else {
				return {status: 'unchanged', execution};
			}
		} else {
			if (!execution.timing.startTransaction.confirmed) {
				const txStatus = await getTransactionStatus(provider, execution.timing.startTransaction, finality);
				if (!txStatus.finalised) {
					const newCheckinTime = computePotentialExecutionTime(execution, {
						startTimeToCountFrom: txStatus.blockTime || currentTimestamp,
					});
					const executionToRetry = await retryLater(execution, newCheckinTime);
					return {status: 'willRetry', execution: executionToRetry};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
						// TODO archive
						await storage.deleteExecution(execution);
						return {status: 'deleted'};
					}
					// TODO implement event expectation with params extraction
					// if (execution.timing.startTransaction.expectEvent) {
					// 	// for (const log of receipt.logs) {
					// 	// 	log.
					// 	// }
					// 	// if event then continue and extract param
					// 	// else delete as the tx has not been doing what it was supposed to do
					// }

					execution.timing.startTransaction.confirmed = {
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

	async function processExecution(execution: ExecutionQueued<TransactionDataType>, result: QueueProcessingResult) {
		const chainIdDecimal = Number(execution.chainId).toString();
		const {provider, finality, worstCaseBlockTime} = _getChainConfig(execution.chainId);

		// Note here that if the service use a contract timestamp or a network who has its own deviating timestamp
		// then the system mostyl assume that only one of such network/contract is being used
		// Otherwise, tx ordering will affect the priority of these tx
		// this is because tx using normal time will always be fetched first
		// an option to processQueue only with specific contract/network could be used
		// or alternatively a startTime option to diregard past transaction
		// but this comes with its own risk.

		let currentTimestamp = result.chainTimetamps[chainIdDecimal];
		if (!currentTimestamp) {
			currentTimestamp = await time.getTimestamp(provider);
			result.chainTimetamps[chainIdDecimal] = currentTimestamp;
		}

		if (!currentTimestamp) {
			logger.error(`currentTimestamp: ${currentTimestamp}`);
		}

		const updates = await checkAndUpdateExecutionIfNeeded(execution, currentTimestamp);
		if (updates.status === 'deleted' || updates.status === 'willRetry') {
			let status: ExecutionStatus;
			if (updates.status === 'deleted') {
				status = {
					type: 'deleted',
					reason: 'udpates deleted',
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
				finality * worstCaseBlockTime
		) {
			// delete if execution expired
			logger.info(`too late, deleting ${displayExecution(execution)}...`);
			// TODO archive
			await storage.deleteExecution(execution);
			result.executions.push({
				chainId: execution.chainId,
				account: execution.account,
				slot: execution.slot,
				checkinTime: execution.checkinTime,
				status: {type: 'deleted', reason: 'too late'},
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
				logger.info(`not yet time: ${time2text(newCheckinTime - currentTimestamp)} to wait...`);
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
			chainTimetamps: {},
		};

		// TODO only query up to a certain time
		const executions = await storage.getQueueTopMostExecutions({limit});

		if (executions.length === 0) {
			logger.info(`found zero executions to process`);
		} else if (executions.length === 1) {
			logger.info(`found 1 queued execution for ${executions[0].checkinTime}`);
		} else {
			logger.info(
				`found ${executions.length} queued execution from ${executions[0].checkinTime} to ${
					executions[executions.length - 1].checkinTime
				}`,
			);
		}

		for (const execution of executions) {
			try {
				await processExecution(execution, result);
			} catch (processExecutionError) {
				logger.error(
					`Processing of execution "${execution.chainId}_${execution.account}_${execution.slot}" thrown an exception`,
					processExecutionError,
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

	return {
		submitExecution,
		processQueue,
	};
}

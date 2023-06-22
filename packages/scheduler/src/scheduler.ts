import {logs} from 'named-logs';
import {dequals} from './utils/js';
import {getTransactionStatus} from './utils/ethereum';
import {time2text} from './utils/time';
import {EIP1193Account, EIP1193DATA} from 'eip-1193';
import {computePotentialExecutionTime, computeFirstExecutionTimeFromSubmission} from './utils/execution';
import {displayExecution} from './utils/debug';
import {
	ChainConfig,
	ExecutionStatus,
	QueueProcessingResult,
	ScheduledExecution,
	ScheduleInfo,
	Scheduler,
	SchedulerBackend,
	SchedulerConfig,
	WithTimeContract,
} from './types/scheduler';
import {ExecutionQueued} from './types/scheduler-storage';

const logger = logs('fuzd-scheduler');

export function createScheduler<TransactionDataType, TransactionInfoType>(
	config: SchedulerConfig<TransactionDataType, TransactionInfoType>
): Scheduler<TransactionDataType> & SchedulerBackend {
	const {chainConfigs, time, storage, executor} = config;
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	async function _getTimes({contract, chainId}: {chainId: `0x${string}`; contract?: EIP1193Account}) {
		const realTime = await time.getTimestamp();
		const virtualTime = contract ? await _getVirtualTime({chainId, contract}) : realTime;
		return {
			virtualTime,
			realTime,
		};
	}

	async function _getVirtualTime({
		chainId,
		contract,
	}: {
		chainId: `0x${string}`;
		contract: EIP1193Account;
	}): Promise<number> {
		const provider = config.chainConfigs[chainId].provider;
		if (!provider) {
			throw new Error(`no provider for chain ${chainId}`);
		}
		const result = await provider.request({
			method: 'eth_call',
			params: [
				{
					to: contract,
					data: '0xb80777ea', // timestamp()
				},
			],
		});
		const value = parseInt(result.slice(2), 16);
		return value;
	}

	async function submitExecution(
		id: string,
		account: EIP1193Account,
		execution: ScheduledExecution<TransactionDataType>
	): Promise<ScheduleInfo> {
		const chainConfig = chainConfigs[execution.chainId];
		if (!chainConfig) {
			throw new Error(
				`cannot proceed, this schjeduler is not configured to support chain with id ${execution.chainId}`
			);
		}

		const checkinTime = computeFirstExecutionTimeFromSubmission(execution);

		const queuedExecution: ExecutionQueued<TransactionDataType> = {
			...execution,
			account,
			id,
			checkinTime,
			retries: 0,
		};

		const existingExecution = await storage.getQueuedExecution({chainId: execution.chainId, id, checkinTime});
		if (existingExecution) {
			if (dequals(existingExecution, queuedExecution)) {
				logger.info(
					`execution has already been submitted and has not been completed or cancelled, queueID: ${displayExecution(
						existingExecution
					)}`
				);
				return {checkinTime};
			} else {
				throw new Error(
					`an execution with the same id as already been submitted and is still being processed, queueID: ${displayExecution(
						existingExecution
					)}`
				);
			}
		}
		await storage.queueExecution(queuedExecution);
		return {checkinTime};
	}

	async function retryLater(
		oldCheckinTime: number,
		execution: ExecutionQueued<TransactionDataType>,
		newCheckinTime: number
	): Promise<ExecutionQueued<TransactionDataType>> {
		execution.retries++;
		if (execution.retries >= 10) {
			logger.info(`deleting execution ${execution.id} after ${execution.retries} retries ...`);
			// TODO hook await this._reduceSpending(reveal);
			await storage.deleteExecution({chainId: execution.chainId, id: execution.id, checkinTime: oldCheckinTime});
		} else {
			execution.checkinTime = newCheckinTime;
			await storage.reassignExecutionInQueue(oldCheckinTime, execution);
		}
		return execution;
	}

	async function execute(execution: ExecutionQueued<TransactionDataType>): Promise<ExecutionStatus> {
		let transaction: TransactionDataType;
		if (execution.type === 'time-locked') {
			if (!config.decrypter) {
				throw new Error(
					`the scheduler has not been configured with a decrypter. As such it cannot support "time-locked" execution`
				);
			}

			const decryptionResult = await config.decrypter.decrypt(execution);
			if (decryptionResult.success) {
				transaction = decryptionResult.transaction;
			} else {
				if (decryptionResult.retry) {
					const oldCheckinTime = execution.checkinTime;
					execution.checkinTime = decryptionResult.retry;
					await storage.reassignExecutionInQueue(oldCheckinTime, execution);
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
			transaction = execution.transaction;
		}

		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

		const executionResult = await executor.submitTransaction(execution.id, execution.account, transaction);

		// if we reaches there, the execution is now handled by the executor
		// the schedule has done its job
		// if for some reason `executor.submitTransaction(...)` fails to return but has actually broadcasted the tx
		// the scheduler will attempt again. the id tell the executor to not reexecute
		await storage.deleteExecution(execution);

		return {type: 'broadcasted', reason: `broadcasted via tx ${executionResult && (executionResult as any).hash}`};
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
		currentTimestamp: number
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
					await storage.deleteExecution(execution);
					return {status: 'deleted'};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
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
					const executionToRetry = await retryLater(execution.checkinTime, execution, newCheckinTime);
					return {status: 'willRetry', execution: executionToRetry};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
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

	async function processQueue(onlyWithTimeContract?: WithTimeContract) {
		const realTime = await time.getTimestamp();
		const currentTimestamp = onlyWithTimeContract
			? await _getVirtualTime({
					chainId: onlyWithTimeContract.chainId,
					contract: onlyWithTimeContract.timeContract,
			  })
			: realTime;

		const limit = maxNumTransactionsToProcessInOneGo;

		const result: QueueProcessingResult = {
			timestamp: currentTimestamp,
			limit,
			executions: [],
		};

		// TODO only query up to a certain time
		const executions = await storage.getQueueTopMostExecutions({limit}, onlyWithTimeContract);

		if (executions.length === 0) {
			logger.info(`found zero executions to process`);
		} else if (executions.length === 1) {
			logger.info(`found 1 queued execution for ${executions[0].checkinTime}`);
		} else {
			logger.info(
				`found ${executions.length} queued execution from ${executions[0].checkinTime} to ${
					executions[executions.length - 1].checkinTime
				}`
			);
		}

		for (const execution of executions) {
			const {finality, worstCaseBlockTime} = _getChainConfig(execution.chainId);

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
					id: execution.id,
					checkinTime: execution.checkinTime,
					status,
				});
				continue;
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

				await storage.deleteExecution(execution);
				result.executions.push({
					id: execution.id,
					checkinTime: execution.checkinTime,
					status: {type: 'deleted', reason: 'too late'},
				});
				continue;
			}

			if (currentTimestamp >= newCheckinTime) {
				// execute if it is the time
				const status = await execute(executionUpdated);
				result.executions.push({
					id: execution.id,
					checkinTime: execution.checkinTime,
					status,
				});
			} else {
				// if not, then in most case we detected a change in the execution time
				if (updates.status === 'changed') {
					await storage.updateExecutionInQueue(executionUpdated);
					result.executions.push({
						id: execution.id,
						checkinTime: execution.checkinTime,
						status: {type: 'reassigned', reason: 'changed'},
					});
				} else {
					// For now as we do not limit result to a certain time, we will reach there often
					logger.info(`not yet time: ${time2text(newCheckinTime - currentTimestamp)} to wait...`);
					result.executions.push({
						id: execution.id,
						checkinTime: execution.checkinTime,
						status: {type: 'skipped', reason: 'not yet time'},
					});
				}
			}
		}

		return result;
	}

	return {
		submitExecution,
		processQueue,
	};
}

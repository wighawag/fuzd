import {logs} from 'named-logs';
import {dequals} from './utils/js';
import {getTransactionStatus} from './utils/ethereum';
import {time2text} from './utils/time';
import {EIP1193Account, EIP1193TransactionDataOfType2} from 'eip-1193';
import {computeExecutionTime, computeExecutionTimeFromSubmission} from './utils/execution';
import {displayExecution} from './utils/debug';
import {Execution, ScheduleInfo, Scheduler, SchedulerBackend, SchedulerConfig} from './types/scheduler';
import {ExecutionQueued} from './types/scheduler-storage';

const logger = logs('dreveal-scheduler');

export function createScheduler(config: SchedulerConfig): Scheduler & SchedulerBackend {
	const {provider, time, storage, executor, chainId} = config;
	const finality = config.finality;
	const worstCaseBlockTime = config.worstCaseBlockTime;
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	async function submitExecution(id: string, account: EIP1193Account, execution: Execution): Promise<ScheduleInfo> {
		const executionTime = computeExecutionTimeFromSubmission(execution);

		const queuedExecution: ExecutionQueued = {
			...execution,
			account,
			id,
			executionTime,
			retries: 0,
		};

		const existingExecution = await storage.getQueuedExecution({id, executionTime});
		if (existingExecution) {
			if (dequals(existingExecution, queuedExecution)) {
				logger.info(
					`execution has already been submitted and has not been completed or cancelled, queueID: ${displayExecution(
						existingExecution
					)}`
				);
				return {executionTime};
			} else {
				throw new Error(
					`an execution with the same id as already been submitted and is still being processed, queueID: ${displayExecution(
						existingExecution
					)}`
				);
			}
		}
		await storage.queueExecution(queuedExecution);
		return {executionTime};
	}

	async function retryLater(
		oldExecutionTime: number,
		execution: ExecutionQueued,
		newTimestamp: number
	): Promise<ExecutionQueued> {
		execution.retries++;
		if (execution.retries >= 10) {
			logger.info(`deleting execution ${execution.id} after ${execution.retries} retries ...`);
			// TODO hook await this._reduceSpending(reveal);
			await storage.deleteExecution({id: execution.id, executionTime: oldExecutionTime});
		} else {
			execution.executionTime = newTimestamp;
			await storage.reassignExecutionInQueue(oldExecutionTime, execution);
		}
		return execution;
	}

	async function execute(execution: ExecutionQueued) {
		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

		if (execution.type === 'time-locked') {
			throw new Error(`time-locked tx not supported for now`);
		}

		const {hash} = await executor.submitTransaction(execution.id, execution.account, execution.tx);

		console.log({hash});

		// if we reaches there, the execution is now handled by the executor
		// the schedule has done its job
		// if for some reason `executor.submitTransaction(...)` fails to return but has actually broadcasted the tx
		// the scheduler will attempt again. the id tell the executor to not reexecute
		await storage.deleteExecution(execution);
	}

	async function checkAndUpdateExecutionIfNeeded(
		execution: ExecutionQueued
	): Promise<
		| {status: 'deleted'}
		| {status: 'changed'; execution: ExecutionQueued}
		| {status: 'unchanged'; execution: ExecutionQueued}
		| {status: 'willRetry'; execution: ExecutionQueued}
	> {
		// TODO callback for balance checks ?
		const timestamp = await time.getTimestamp();

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
					const executionToRetry = await retryLater(
						execution.executionTime,
						execution,
						computeExecutionTime(execution, txStatus.blockTime || timestamp)
					);
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

	async function processQueue() {
		const timestamp = await time.getTimestamp();

		const limit = maxNumTransactionsToProcessInOneGo;
		// TODO only query up to a certain time
		const executions = await storage.getQueueTopMostExecutions({limit});

		if (executions.length === 0) {
			console.log(`found zero executions to process`);
		} else if (executions.length === 1) {
			console.log(`found 1 queued execution for ${executions[0].executionTime}`);
		} else {
			console.log(
				`found ${executions.length} queued execution from ${executions[0].executionTime} to ${
					executions[executions.length].executionTime
				}`
			);
		}

		for (const execution of executions) {
			const updates = await checkAndUpdateExecutionIfNeeded(execution);
			if (updates.status === 'deleted' || updates.status === 'willRetry') {
				continue;
			}

			const executionUpdated = updates.execution;
			const executionTime = computeExecutionTime(executionUpdated);

			if (
				timestamp >
				executionTime +
					Math.min(executionUpdated.timing.expiry || Number.MAX_SAFE_INTEGER, maxExpiry) +
					finality * worstCaseBlockTime
			) {
				// delete if execution expired
				logger.info(`too late, deleting ${displayExecution(execution)}...`);

				await storage.deleteExecution(execution);
				continue;
			}

			if (timestamp >= executionTime) {
				// execute if it is the time
				await execute(executionUpdated);
			} else {
				// if not, then in most case we detected a change in the execution time
				if (updates.status === 'changed') {
					await storage.updateExecutionInQueue(executionUpdated);
				} else {
					// For now as we do not limit result to a certain time, we will reach there often
					logger.info(`not yet time: ${time2text(executionTime - timestamp)} to wait...`);
				}
			}
		}
	}

	return {
		submitExecution,
		processQueue,
	};
}

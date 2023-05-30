import {logs} from 'named-logs';
import {Execution, ExecutionBroadcastStored, ExecutionStored, ExecutorConfig, TransactionData} from './types';
import {dequals} from './utils/js';
const logger = logs('dreveal-executor');

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

function computeExecutionTime(execution: Execution): number {
	if (execution.timing.type === 'timestamp') {
		return execution.timing.timestamp;
	} else {
		throw new Error(`execution timing type (${execution.timing.type}) not supported yet`);
		// const revealTime = Math.max(reveal.arrivalTimeWanted, reveal.startTime + reveal.minDuration);
		// + contracts.OuterSpace.linkedData.resolveWindow + this.finality * 15
	}
}

function computeQueueID(executionTime: number, id: string): string {
	return `q_${lexicographicNumber(executionTime, 12)}_${id}`;
}

function computeBroadcastID(id: string): string {
	return `b_${id}`;
}

// DB need to support 256 bytes keys
// broadcast_list : b_0x<account>_<id: can be tx hash>: or dependent tx hash
// store until broadcasted
// queue: q_<timestamo>_0x<account>_<id: can be tx hash>: or dependent tx hash
// delete once broadcasted

export function createExecutor(config: ExecutorConfig) {
	const {provider, time, db, wallet, chainId} = config;
	const finality = config.finality;
	const worstCaseBlockTime = config.worstCaseBlockTime;
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;
	const chainIdAsHex = `0x${BigInt(chainId).toString(16)}` as const;

	// TODO id
	// should we include account management ?
	// if not the id will most like be player_account + some counter
	async function submitExecution(id: string, execution: Execution): Promise<string> {
		logger.info(execution);

		const executionTime = computeExecutionTime(execution);
		const queueID = computeQueueID(executionTime, id);
		const broadcastID = computeBroadcastID(id);

		const existingExecution = await db.get<ExecutionStored>(queueID);
		if (existingExecution) {
			if (dequals(existingExecution, execution)) {
				logger.info(
					`execution has already been submitted and has not been completed or cancelled, queueID: ${queueID}`
				);
				return queueID;
			} else {
				throw new Error(
					`an execution with the same id as already been submitted and is still being processed, queueID: ${queueID}`
				);
			}
		}

		const broadcast = await db.get<ExecutionBroadcastStored>(broadcastID);
		if (broadcast) {
			if (broadcast.pendingID) {
				// TODO what should we do here, for now reject
				// the transaction is already on its way and unless the initial data was wrong, the tx is going to go through
				// could add a FORCE option ?
				// return AlreadyPending();
				throw new Error(`transaction is already on its way, cannot be cancelled or changed`);
			} else if (queueID != broadcast.queueID) {
				// this is possible if the execution time is different now
				// this mean we need to delete the previous broadcast
				db.delete(broadcast.queueID);
				// await db.delete(revealID); // no need as it will be overwritten below
			}
		}

		// db.put<AccountData>(accountID, accountRefected);
		db.put<ExecutionStored>(queueID, {...execution, id, retries: 0});
		db.put<ExecutionBroadcastStored>(broadcastID, {queueID});

		return queueID;
	}

	async function execute(queueID: string, execution: ExecutionStored) {
		let transaction: TransactionData | undefined;

		let startTime = execution.assumedTransactionConfirmed;

		if (execution.assumingTransaction) {
			if (!execution.assumedTransactionConfirmed) {
				const receipt = await provider.request({
					method: 'eth_getTransactionReceipt',
					params: [execution.assumingTransaction.hash],
				});
				let unconfirmed: boolean = true;
				if (receipt) {
					// TODO
					if (receipt.status === '0x1') {
						// TODO delete as the tx has not gone through

						return;
					}

					const latestBlocknumberAshex = await provider.request({method: 'eth_blockNumber'});
					const latestBlockNumber = parseInt(latestBlocknumberAshex.slice(2), 16);
					const receiptBlocknumber = parseInt(receipt.blockNumber.slice(2), 16);

					if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
						logger.error(
							`could not parse blocknumbers, latest: ${latestBlocknumberAshex}, receipt: ${receipt.blockNumber}`
						);
						return;
					}

					const finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - finality);
					if (finalised) {
						unconfirmed = false;
					}
				}

				// TODO implement event expectation with params extraction
				if (execution.assumingTransaction.expectEvent) {
					// for (const log of receipt.logs) {
					// 	log.
					// }
					// if event then continue and extract param
					// else delete as the tx has not been doing what it was supposed to do
				}

				if (!unconfirmed) {
					const block = await provider.request({
						method: 'eth_getBlockByHash',
						params: [receipt.blockHash, false],
					});
					const blockTimestamp = parseInt(block.timestamp.slice(2), 16);
					startTime = blockTimestamp;
					const executionRefetched = await db.get<ExecutionStored>(queueID);
					if (!executionRefetched) {
						logger.error(`execution do not exist anymore`);
						return;
					} else {
						execution = executionRefetched;
					}

					execution.assumedTransactionConfirmed = startTime;
					db.put<ExecutionStored>(queueID, execution); //TODO check race condition?
				}
			}
		}

		if (execution.timing.type === 'duration' && !startTime) {
			logger.info(`execution timing relies on start time, we recompute it`);
			const broadcastID = computeBroadcastID(execution.id);
			const timestamp = time.getTimestamp();

			if (!execution.assumingTransaction) {
				logger.error(`execution timing is "duration" yet it has no assumingTransaction info`);
			} else {
				logger.info(`waiting for tx ${execution.assumingTransaction.hash} ...`);
			}

			execution.retries++;
			if (execution.retries >= 10) {
				logger.info(`deleting execution ${execution.id} after ${execution.retries} retries ...`);
				// TODO hook await this._reduceSpending(reveal);
				db.delete(queueID);
				db.delete(broadcastID);
			} else {
				// TODO change queueID, delete and put
			}
			return;
		}

		if (execution.type === 'clear') {
			if (typeof execution.data === 'string') {
				transaction = {
					type: '0x2',
					chainId: chainIdAsHex,
					to: execution.to,
					data: execution.data,
					accessList: execution.accessList,
					gas: `0x${BigInt(execution.gas).toString(16)}`,
					maxFeePerGas: `0x${BigInt(execution.feeStrategy.maxFeePerGas).toString(16)}`,
					maxPriorityFeePerGas: `0x${BigInt(execution.feeStrategy.maxPriorityFeePerGas).toString(16)}`,
					// TODO nonce
					// TODO? value
				};
			} else {
				throw new Error(`only data string supported for now`);
			}
		}

		if (!transaction) {
			throw new Error(`no transaction`);
		}

		const rawTransaction = await wallet.signTransaction(transaction);
		await provider.request({
			method: 'eth_sendRawTransaction',
			params: [rawTransaction],
		});
	}

	async function process() {
		const timestamp = await time.getTimestamp();

		const limit = maxNumTransactionsToProcessInOneGo;
		const executions = await db.list<ExecutionStored>({prefix: 'q_', limit});

		for (const executionEntry of executions.entries()) {
			const queueID = executionEntry[0];
			const execution = executionEntry[1];

			const executionTime = computeExecutionTime(execution);

			if (
				timestamp >
				executionTime +
					Math.min(execution.timing.expiry || Number.MAX_SAFE_INTEGER, maxExpiry) +
					finality * worstCaseBlockTime
			) {
				logger.info(`too late, deleting ${queueID}...`);
				const broadcastID = `b_${execution.id}`;
				db.delete(queueID);
				db.delete(broadcastID);
			} else if (timestamp >= executionTime) {
				await execute(queueID, execution);
			} else {
				logger.info(
					`skip execution (queueID: ${queueID}) because not yet time executionTime (${executionTime}) > timestamp (${timestamp})`
				);
			}
		}
	}

	return {
		submitExecution,
		process,
	};
}

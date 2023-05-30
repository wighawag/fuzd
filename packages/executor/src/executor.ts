import {logs} from 'named-logs';
import {Execution, ExecutionBroadcastStored, ExecutionStored, ExecutorConfig, TransactionData} from './types';
import {dequals} from './utils/js';
import {EIP1193ProviderWithoutEvents, EIP1193TransactionReceipt} from 'eip-1193';
import {DecryptedTransactionData} from '../dist';
const logger = logs('dreveal-executor');

function lexicographicNumber(num: number, size: number): string {
	if (num.toString().length > size) {
		throw new Error(`number bigger than the lexicographic representation allow. Number : ${num}, Size: ${size}`);
	}
	return num.toString().padStart(size, '0');
}

// TODO
async function decrypt(payload: string): Promise<DecryptedTransactionData> {
	return {
		data: '0x',
		to: '0x',
	};
}

function computeExecutionTime(execution: ExecutionStored, expectedStartTime?: number): number {
	if (execution.timing.type === 'fixed') {
		return execution.timing.timestamp;
	} else if (execution.timing.type === 'delta') {
		return (
			execution.timing.delta +
			(execution.timing.startTransaction.confirmed
				? execution.timing.startTransaction.confirmed?.startTime
					? execution.timing.startTransaction.confirmed?.startTime
					: execution.timing.startTransaction.confirmed?.blockTime
				: expectedStartTime
				? expectedStartTime
				: execution.timing.startTransaction.broadcastTime)
		);
	} else {
		throw new Error(`execution timing type must be "fixed" or "delta"`);
	}
}

function computeQueueID(executionTime: number, id: string): string {
	return `q_${lexicographicNumber(executionTime, 12)}_${id}`;
}

function computeBroadcastID(id: string): string {
	return `b_${id}`;
}

async function getTransactionStatus(
	provider: EIP1193ProviderWithoutEvents,
	transaction: {hash: `0x${string}`; nonce: number},
	finality: number
): Promise<
	| {finalised: true; blockTime: number; receipt: EIP1193TransactionReceipt; failed: boolean}
	| {finalised: false; blockTime?: number; receipt?: EIP1193TransactionReceipt; failed?: boolean}
> {
	let finalised = false;
	let blockTime: number | undefined;
	// TODO fix eip-1193 to make receipt response optional, is that a null ?
	const receipt: EIP1193TransactionReceipt | undefined = await provider.request({
		method: 'eth_getTransactionReceipt',
		params: [transaction.hash],
	});
	if (receipt) {
		const latestBlocknumberAshex = await provider.request({method: 'eth_blockNumber'});
		const latestBlockNumber = parseInt(latestBlocknumberAshex.slice(2), 16);
		const receiptBlocknumber = parseInt(receipt.blockNumber.slice(2), 16);

		if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
			throw new Error(
				`could not parse blocknumbers, latest: ${latestBlocknumberAshex}, receipt: ${receipt.blockNumber}`
			);
		}

		finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - finality);

		const block = await provider.request({
			method: 'eth_getBlockByHash',
			params: [receipt.blockHash, false],
		});
		blockTime = parseInt(block.timestamp.slice(2), 16);
	}

	let failed = false;
	if (receipt.status === '0x0') {
		failed = true;
	} else if (receipt.status === '0x1') {
		failed = false;
	} else {
		throw new Error(`Could not get the tx status for ${receipt.transactionHash} (status: ${receipt.status})`);
	}

	if (finalised) {
		return {
			finalised,
			blockTime: blockTime as number,
			receipt: receipt as EIP1193TransactionReceipt,
			failed: failed as boolean,
		};
	} else {
		return {
			finalised,
			blockTime,
			receipt,
			failed,
		};
	}
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

		const executionToStore: ExecutionStored = {...execution, id, retries: 0};

		const executionTime = computeExecutionTime(executionToStore);
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
		db.put<ExecutionStored>(queueID, executionToStore);
		db.put<ExecutionBroadcastStored>(broadcastID, {queueID});

		return queueID;
	}

	async function retryLater(queueID: string, execution: ExecutionStored, newTimestamp: number) {
		const broadcastID = computeBroadcastID(execution.id);

		execution.retries++;
		if (execution.retries >= 10) {
			logger.info(`deleting execution ${execution.id} after ${execution.retries} retries ...`);
			// TODO hook await this._reduceSpending(reveal);
			db.delete(queueID);
			db.delete(broadcastID);
		} else {
			// TODO change queueID, delete and put
		}
	}

	async function execute(queueID: string, execution: ExecutionStored) {
		const timestamp = await time.getTimestamp();

		let transaction: TransactionData | undefined;

		if (execution.timing.type === 'fixed') {
			if (execution.timing.assumedTransaction && !execution.timing.assumedTransaction.confirmed) {
				const txStatus = await getTransactionStatus(provider, execution.timing.assumedTransaction, finality);

				if (!txStatus.finalised) {
					// TODO delete fixed time and the tx that it depends on is not even finalized
					return;
				} else {
					if (txStatus.failed) {
						// TODO delte
						return;
					}
					// we do not really need to store that, we can skip it and simply execute
					// execution.timing.assumedTransaction.confirmed = {
					// 	blockTime: txStatus.blockTime,
					// };
				}
			}
		} else {
			const txStatus = await getTransactionStatus(provider, execution.timing.startTransaction, finality);
			if (!txStatus.finalised) {
				await retryLater(queueID, execution, computeExecutionTime(execution, txStatus.blockTime || timestamp));
				return;
			} else {
				if (txStatus.failed) {
					// TODO remove
					return;
				}
				// TODO implement event expectation with params extraction
				if (execution.timing.startTransaction.expectEvent) {
					// for (const log of receipt.logs) {
					// 	log.
					// }
					// if event then continue and extract param
					// else delete as the tx has not been doing what it was supposed to do
				}

				execution.timing.startTransaction.confirmed = {
					blockTime: txStatus.blockTime,
				};
				// we want to save it if the delta has changed and we should push on a later time in the queue
			}
		}

		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

		if (execution.tx.type === 'clear') {
			if (typeof execution.tx.data === 'string') {
				transaction = {
					type: '0x2',
					chainId: chainIdAsHex,
					to: execution.tx.to,
					data: execution.tx.data,
					accessList: execution.tx.accessList,
					gas: `0x${BigInt(execution.tx.gas).toString(16)}`,
					maxFeePerGas: `0x${BigInt(execution.tx.feeStrategy.maxFeePerGas).toString(16)}`,
					maxPriorityFeePerGas: `0x${BigInt(execution.tx.feeStrategy.maxPriorityFeePerGas).toString(16)}`,
					// TODO nonce
					// TODO? value
				};
			} else {
				throw new Error(`only data string supported for now`);
			}
		} else {
		}

		if (!transaction) {
			throw new Error(`no transaction, only "clear" and "time-locked" are supported`);
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

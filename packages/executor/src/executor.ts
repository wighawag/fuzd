import {logs} from 'named-logs';
import {
	Execution,
	ExecutionBroadcastStored,
	ExecutionPendingTransactionData,
	ExecutionStored,
	ExecutorConfig,
	TransactionData,
	TransactionInfo,
	Broadcaster,
} from './types';
import {dequals} from './utils/js';
import {DecryptedTransactionData} from '../dist';
import {getTransactionStatus} from './utils/ethereum';
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

// DB need to support 256 bytes keys
// broadcast_list : b_0x<account>_<id: can be tx hash>: or dependent tx hash
// store until broadcasted
// queue: q_<timestamo>_0x<account>_<id: can be tx hash>: or dependent tx hash
// delete once broadcasted
// transaction counter: pending

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
			} else {
				throw new Error(`execution with same id is already submitted`);
				// TODO should we still proceed ?
				// } else if (queueID != broadcast.queueID) {

				// 	// TODO consider race conidtion

				// 	// this is possible if the execution time is different now
				// 	// this mean we need to delete the previously queued execution (we assume the new request is correct)
				// 	db.delete(broadcast.queueID);
				// 	// await db.delete(revealID); // no need as it will be overwritten below
			}
		}

		// db.put<AccountData>(accountID, accountRefected);
		// TODO callback for account ?
		db.put<ExecutionStored>(queueID, executionToStore);
		db.put<ExecutionBroadcastStored>(broadcastID, {queueID});

		return queueID;
	}

	async function retryLater(
		queueID: string,
		execution: ExecutionStored,
		newTimestamp: number
	): Promise<ExecutionStored> {
		const broadcastID = computeBroadcastID(execution.id);

		execution.retries++;
		if (execution.retries >= 10) {
			logger.info(`deleting execution ${execution.id} after ${execution.retries} retries ...`);
			// TODO hook await this._reduceSpending(reveal);
			db.delete(queueID);
			db.delete(broadcastID);
		} else {
			db.delete(queueID);
			db.put<ExecutionStored>(computeQueueID(newTimestamp, execution.id), execution);
			// TODO change queueID, delete and put
		}
		return execution;
	}

	async function _submitTransaction(
		transactionData: TransactionData,
		options: {expectedNonce?: number; forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas?: bigint}
	): Promise<{tx: TransactionInfo}> {
		// TODO pass it in to remove the await
		const timestamp = await time.getTimestamp();

		let nonceIncreased = false;
		let nonce: number | undefined;
		if (options.forceNonce) {
			nonce = options.forceNonce;
		}
		if (options.expectedNonce) {
			if (!nonce) {
				const nonceAsHex = await provider.request({
					method: 'eth_getTransactionCount',
					params: [wallet.address, 'latest'],
				});
				nonce = parseInt(nonceAsHex.slice(2), 16);
				if (isNaN(nonce)) {
					throw new Error(`could not parse transaction count while checking for expected nonce`);
				}
			}
			if (nonce !== options.expectedNonce) {
				if (nonce > options.expectedNonce) {
					const message = `nonce not matching, expected ${options.expectedNonce}, got ${nonce}, increasing...`;
					console.error(message);
					nonceIncreased = true;
					// return {error: {message, code: 5501}};
				} else {
					const message = `nonce not matching, expected ${options.expectedNonce}, got ${nonce}`;
					console.error(message);

					// return {error: {message, code: 5501}};
					throw new Error(message);
				}
			}
		}

		if (!nonce) {
			const nonceAsHex = await provider.request({
				method: 'eth_getTransactionCount',
				params: [wallet.address, 'latest'],
			});
			nonce = parseInt(nonceAsHex.slice(2), 16);
			if (isNaN(nonce)) {
				throw new Error(`could not parse transaction count while checking for expected nonce`);
			}
		}

		let maxPriorityFeePerGas = options.maxPriorityFeePerGas;
		// let feeHistory:
		// | {
		//     baseFeePerGas: string[];
		//     gasUsedRatio?: number[]; // not documented on https://playground.open-rpc.org/?schemaUrl=https://raw.githubusercontent.com/ethereum/eth1.0-apis/assembled-spec/openrpc.json&uiSchema%5BappBar%5D%5Bui:splitView%5D=false&uiSchema%5BappBar%5D%5Bui:input%5D=false&uiSchema%5BappBar%5D%5Bui:examplesDropdown%5D=false
		//     oldestBlock: number;
		//     reward: string[][];
		//   }
		// | undefined = undefined;
		// try {
		//   // TODO check what best to do to ensure we do not unecessarely high maxPriorityFeePerGas
		//   // in worst case, we could continue and try catch like below catching specific error message
		//   feeHistory = await this.provider.send('eth_feeHistory', [
		//     1,
		//     'latest',
		//     [100],
		//   ]);
		// } catch (e) {}
		// if (feeHistory) {
		//   if (options.maxFeePerGas.lt(feeHistory.reward[0][0])) {
		//     maxPriorityFeePerGas = options.maxFeePerGas;
		//   }
		//   this.info(feeHistory.reward);
		// } else {
		//   this.info('no feeHistory')
		// }

		// this.info('getting mathcing alliance...');
		// // const alliance = await this._getAlliance(reveal);
		// this.info({alliance});

		logger.info('checcking if tx should still be submitted');
		const already_resolved = false;
		// const {quantity} = await this.outerspaceContract.getFleet(reveal.fleetID, '0');
		if (already_resolved) {
			if (nonceIncreased) {
				// return {error: {message: 'nonce increased but fleet already resolved', code: 5502}};
				throw new Error(`nonce increased but already resolved`);
			} else {
				logger.error('already done, sending dummy transaction');

				try {
					const rawTx = await wallet.signTransaction({
						type: '0x2',
						to: wallet.address,
						nonce: `0x${nonce.toString(16)}` as `0x${string}`,
						maxFeePerGas: `0x${options.maxFeePerGas.toString(16)}` as `0x${string}`,
						maxPriorityFeePerGas: options.maxPriorityFeePerGas
							? (`0x${options.maxPriorityFeePerGas.toString(16)}` as `0x${string}`)
							: undefined,
						chainId: chainIdAsHex,
					});
					const hash = await provider.request({method: 'eth_sendRawTransaction', params: [rawTx]});
					return {
						tx: {
							hash,
							nonce,
							broadcastTime: timestamp,
							maxFeePerGasUsed: options.maxFeePerGas.toString(),
						},
					};
				} catch (e) {
					logger.error(`FAILED TO SEND DUMMY TX`, e);
					// TODO do something
					throw e;
				}
			}
		} else {
			const rawTx = await wallet.signTransaction(transactionData);
			const hash = await provider.request({method: 'eth_sendRawTransaction', params: [rawTx]});
			return {
				tx: {
					hash,
					nonce,
					broadcastTime: timestamp,
					maxFeePerGasUsed: options.maxFeePerGas.toString(),
				},
			};
		}
	}

	async function execute(queueID: string, execution: ExecutionStored) {
		let transaction: TransactionData | undefined;

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

		const broadcasterID = `broadcaster_${wallet.address}`;
		// we get the transaction count
		let broadcaster = await db.get<Broadcaster>(broadcasterID);
		if (!broadcaster) {
			const transactionCountAsHex = await provider.request({
				method: 'eth_getTransactionCount',
				params: [wallet.address, 'latest'],
			});
			const transactionCount = parseInt(transactionCountAsHex.slice(2), 16);
			if (isNaN(transactionCount)) {
				throw new Error(`could not parse transactionCount`);
			}
			broadcaster = await db.get<Broadcaster>(broadcasterID);
			if (!broadcaster) {
				broadcaster = {nextNonce: transactionCount}; // ensure no duplicate id in the bucket even if exact same boradcastingTime
				await db.put<Broadcaster>('pending', broadcaster);
			}
		}

		const result = await _submitTransaction(transaction, {
			expectedNonce: broadcaster.nextNonce,
			maxFeePerGas: currentMaxFee.maxFeePerGas,
			maxPriorityFeePerGas: currentMaxFee.maxPriorityFeePerGas,
		});

		const broadcastID = computeBroadcastID(execution.id);
		const broadcast = await db.get<ExecutionBroadcastStored>(broadcastID);
		if (!broadcast) {
			// TODO what to do here. this should not happen
			return;
		}
		if (broadcast.pendingID) {
			// Already pending
			// TODO what to do here ?
		} else if (broadcast.queueID) {
			queueID = broadcast.queueID;
		}

		// TODO
		// transactionCounter should not be changed in between
		// if it was, one tx would override another
		// we could save both somehow?
		// should not happen as the only submitter is the CRON job, leave it for now

		const pendingID = `pending_${lexicographicNumber(broadcaster.nextNonce, 12)}`;
		db.put<ExecutionBroadcastStored>(broadcastID, {pendingID}); // no queueID
		db.put<ExecutionPendingTransactionData>(pendingID, {...execution, broadcastedTransaction: result.tx});

		broadcaster.nextNonce = result.tx.nonce + 1;
		await db.put<Broadcaster>(broadcasterID, broadcaster);
		await db.delete(queueID);
	}

	async function checkAndUpdateExecutionIfNeeded(
		queueID: string,
		execution: ExecutionStored
	): Promise<
		| {status: 'deleted'}
		| {status: 'changed'; execution: ExecutionStored}
		| {status: 'unchanged'; execution: ExecutionStored}
		| {status: 'willRetry'; execution: ExecutionStored}
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
					db.delete(queueID);
					db.delete(computeBroadcastID(execution.id));
					return {status: 'deleted'};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
						db.delete(queueID);
						db.delete(computeBroadcastID(execution.id));
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
						queueID,
						execution,
						computeExecutionTime(execution, txStatus.blockTime || timestamp)
					);
					return {status: 'willRetry', execution: executionToRetry};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
						db.delete(queueID);
						db.delete(computeBroadcastID(execution.id));
						return {status: 'deleted'};
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
		const executions = await db.list<ExecutionStored>({prefix: 'q_', limit});

		for (const executionEntry of executions.entries()) {
			const queueID = executionEntry[0];
			const updates = await checkAndUpdateExecutionIfNeeded(queueID, executionEntry[1]);
			if (updates.status === 'deleted' || updates.status === 'willRetry') {
				continue;
			}

			const executionUpdated = updates.execution;
			const executionTime = computeExecutionTime(executionUpdated);
			// delete if execution expired
			if (
				timestamp >
				executionTime +
					Math.min(executionUpdated.timing.expiry || Number.MAX_SAFE_INTEGER, maxExpiry) +
					finality * worstCaseBlockTime
			) {
				logger.info(`too late, deleting ${queueID}...`);
				const broadcastID = `b_${executionUpdated.id}`;
				db.delete(queueID);
				db.delete(broadcastID);
				continue;
			}

			if (timestamp >= executionTime) {
				await execute(queueID, executionUpdated);
			} else {
				if (updates.status === 'changed') {
					db.put(queueID, executionUpdated);
				}
				logger.info(
					`skip execution (queueID: ${queueID}) because not yet time executionTime (${executionTime}) > timestamp (${timestamp})`
				);
			}
		}
	}

	return {
		submitExecution,
		processQueue,
	};
}

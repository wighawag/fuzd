import {logs} from 'named-logs';
import {DecryptedTransactionData, Execution, ExecutorConfig} from './types/execution';
import {ExecutionPendingTransactionData, ExecutionStored, TransactionInfo, TransactionDataUsed} from './types/storage';
import {dequals} from './utils/js';
import {getTransactionStatus} from './utils/ethereum';
import {time2text} from './utils/time';
import {EIP1193TransactionData} from 'eip-1193';
const logger = logs('dreveal-executor');

// TODO
async function decrypt(payload: `0x${string}`): Promise<DecryptedTransactionData> {
	return {
		data: '0x',
		to: '0x',
	};
}

function computeExecutionTimeFromSubmission(execution: Execution): number {
	if (execution.timing.type === 'fixed') {
		return execution.timing.timestamp;
	} else if (execution.timing.type === 'delta') {
		return execution.timing.delta + execution.timing.startTransaction.broadcastTime;
	} else {
		throw new Error(`execution timing type must be "fixed" or "delta"`);
	}
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

// DB need to support 256 bytes keys
// broadcast_list : b_0x<account>_<id: can be tx hash>: or dependent tx hash
// store until broadcasted
// queue: q_<timestamo>_0x<account>_<id: can be tx hash>: or dependent tx hash
// delete once broadcasted
// transaction counter: pending

function displayExecution(execution: ExecutionStored) {
	return JSON.stringify({id: execution.id, executionTime: execution.executionTime});
}

export function createExecutor(config: ExecutorConfig) {
	const {provider, time, storage, signerProvider, chainId} = config;
	const finality = config.finality;
	const worstCaseBlockTime = config.worstCaseBlockTime;
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;
	const chainIdAsHex = `0x${BigInt(chainId).toString(16)}` as const;

	// TODO id
	// should we include account management ?
	// if not the id will most like be player_account + some counter
	async function submitExecution(id: string, execution: Execution): Promise<{id: string; executionTime: number}> {
		const executionTime = computeExecutionTimeFromSubmission(execution);

		const executionToStore: ExecutionStored = {...execution, executionTime, id, retries: 0};

		const existingExecution = await storage.getExecution(id, executionTime);
		if (existingExecution) {
			if (dequals(existingExecution, execution)) {
				logger.info(
					`execution has already been submitted and has not been completed or cancelled, queueID: ${displayExecution(
						existingExecution
					)}`
				);
				return {id, executionTime};
			} else {
				throw new Error(
					`an execution with the same id as already been submitted and is still being processed, queueID: ${displayExecution(
						existingExecution
					)}`
				);
			}
		}

		const broadcast = await storage.getBroadcastedExecution(id);
		if (broadcast) {
			if ('pendingID' in broadcast && broadcast.pendingID) {
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

		await storage.createExecution(id, executionTime, executionToStore);

		return {executionTime, id};
	}

	async function retryLater(
		oldExecutionTime: number,
		execution: ExecutionStored,
		newTimestamp: number
	): Promise<ExecutionStored> {
		execution.retries++;
		if (execution.retries >= 10) {
			logger.info(`deleting execution ${execution.id} after ${execution.retries} retries ...`);
			// TODO hook await this._reduceSpending(reveal);
			storage.deleteExecution(execution.id, oldExecutionTime);
		} else {
			storage.reassignExecutionToQueue(oldExecutionTime, newTimestamp, execution);
		}
		return execution;
	}

	async function _submitTransaction(
		transactionData: EIP1193TransactionData,
		options: {expectedNonce?: number; forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas?: bigint}
	): Promise<{tx: TransactionInfo}> {
		// TODO pass it in to remove the await
		const timestamp = await time.getTimestamp();

		const [address] = await signerProvider.request({method: 'eth_accounts'});

		let nonceIncreased = false;
		let nonce: number | undefined;
		if (options.forceNonce) {
			nonce = options.forceNonce;
		}
		if (options.expectedNonce) {
			if (!nonce) {
				const nonceAsHex = await provider.request({
					method: 'eth_getTransactionCount',
					params: [address, 'latest'],
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
				params: [address, 'latest'],
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
					const rawTx = await signerProvider.request({
						method: 'eth_signTransaction',
						params: [
							{
								type: '0x2',
								from: address,
								to: address,
								nonce: `0x${nonce.toString(16)}` as `0x${string}`,
								maxFeePerGas: `0x${options.maxFeePerGas.toString(16)}` as `0x${string}`,
								maxPriorityFeePerGas: options.maxPriorityFeePerGas
									? (`0x${options.maxPriorityFeePerGas.toString(16)}` as `0x${string}`)
									: undefined,
								chainId: chainIdAsHex,
							},
						],
					});
					const hash = await provider.request({method: 'eth_sendRawTransaction', params: [rawTx]});
					return {
						tx: {
							hash,
							nonce,
							broadcastTime: timestamp,
							maxFeePerGasUsed: options.maxFeePerGas,
						},
					};
				} catch (e) {
					logger.error(`FAILED TO SEND DUMMY TX`, e);
					// TODO do something
					throw e;
				}
			}
		} else {
			const rawTx = await signerProvider.request({method: 'eth_signTransaction', params: [transactionData]});
			const hash = await provider.request({method: 'eth_sendRawTransaction', params: [rawTx]});
			return {
				tx: {
					hash,
					nonce,
					broadcastTime: timestamp,
					maxFeePerGasUsed: options.maxFeePerGas,
				},
			};
		}
	}

	async function execute(executionTime: number, execution: ExecutionStored) {
		const [address] = await signerProvider.request({method: 'eth_accounts'});

		let transaction: Omit<TransactionDataUsed, 'nonce'> | undefined;

		// now we are ready to execute, if we reached there, this means the execution is in the right time slot
		// we will now process it and broadcast it
		// for encrypted payload we will attempt to decrypt
		// if it fails, we will push it accoridng to time schedule

		const feeStrategy = execution.tx.feeStrategy;

		if (execution.tx.type === 'clear') {
			if (typeof execution.tx.data === 'string') {
				transaction = {
					type: '0x2',
					chainId: chainIdAsHex,
					from: address,
					to: execution.tx.to,
					data: execution.tx.data,
					accessList: execution.tx.accessList,
					gas: `0x${BigInt(execution.tx.gas).toString(16)}`,
					maxFeePerGas: `0x${BigInt(feeStrategy.maxFeePerGas).toString(16)}`,
					maxPriorityFeePerGas: `0x${BigInt(feeStrategy.maxPriorityFeePerGas).toString(16)}`,
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

		// we get the transaction count
		let broadcaster = await storage.getBroadcaster(address);
		if (!broadcaster) {
			const transactionCountAsHex = await provider.request({
				method: 'eth_getTransactionCount',
				params: [address, 'latest'],
			});
			const transactionCount = parseInt(transactionCountAsHex.slice(2), 16);
			if (isNaN(transactionCount)) {
				throw new Error(`could not parse transactionCount`);
			}
			broadcaster = await storage.getBroadcaster(address);
			if (!broadcaster) {
				broadcaster = {nextNonce: transactionCount}; // ensure no duplicate id in the bucket even if exact same boradcastingTime
				await storage.createBroadcaster(address, broadcaster);
			}
		}

		// TODO fee strategies
		const currentMaxFee = feeStrategy;

		const result = await _submitTransaction(transaction, {
			expectedNonce: broadcaster.nextNonce,
			maxFeePerGas: currentMaxFee.maxFeePerGas,
			maxPriorityFeePerGas: currentMaxFee.maxPriorityFeePerGas,
		});

		const broadcast = await storage.getBroadcastedExecution(execution.id);
		if (!broadcast) {
			// TODO what to do here. this should not happen
			return;
		}
		if ('nonce' in broadcast) {
			// Already pending
			// TODO what to do here ?
		} else if (broadcast.executionTime) {
			executionTime = broadcast.executionTime;
		}

		// TODO
		// transactionCounter should not be changed in between
		// if it was, one tx would override another
		// we could save both somehow?
		// should not happen as the only submitter is the CRON job, leave it for now

		const pendingTransaction: ExecutionPendingTransactionData = {
			...execution,
			nonce: result.tx.nonce, // TODO? we shoule remove that as we have  in tx datax`
			broadcastedTransaction: {info: result.tx, data: {...transaction, nonce: `0x${result.tx.nonce.toString()}`}},
		};
		broadcaster.nextNonce = result.tx.nonce + 1;
		await storage.createPendingExecution(
			execution.id,
			executionTime,
			broadcaster.nextNonce,
			pendingTransaction,
			address,
			broadcaster
		);
	}

	async function checkAndUpdateExecutionIfNeeded(
		executionTime: number,
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
					storage.deleteExecution(execution.id, executionTime);
					return {status: 'deleted'};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
						storage.deleteExecution(execution.id, executionTime);
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
						executionTime,
						execution,
						computeExecutionTime(execution, txStatus.blockTime || timestamp)
					);
					return {status: 'willRetry', execution: executionToRetry};
				} else {
					if (txStatus.failed) {
						logger.debug(`deleting the execution as the tx it depends on failed...`);
						storage.deleteExecution(execution.id, executionTime);
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
		// TODO only query up to a certain time
		const executions = await storage.getQueueTopMostExecutions(limit);

		for (const execution of executions) {
			const updates = await checkAndUpdateExecutionIfNeeded(execution.executionTime, execution);
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

				storage.deleteExecution(execution.id, execution.executionTime);
				continue;
			}

			if (timestamp >= executionTime) {
				// execute if it is the time
				await execute(executionUpdated.executionTime, executionUpdated);
			} else {
				// if not, then in most case we detected a change in the execution time
				if (updates.status === 'changed') {
					storage.updateExecutionInQueue(executionUpdated.executionTime, executionUpdated);
				} else {
					// For now as we do not limit result to a certain time, we will reach there often
					logger.info(`not yet time: ${time2text(executionTime - timestamp)} to wait...`);
				}
			}
		}
	}

	async function __processPendingTransaction(
		nonce: number,
		pendingExecution: ExecutionPendingTransactionData
	): Promise<void> {
		// const receipt = await provider.request({
		// 	method: 'eth_getTransactionReceipt',
		// 	params: [pendingExecution.broadcastedTransaction.hash],
		// });
		const pendingTansaction = await provider.request({
			method: 'eth_getTransactionByHash',
			params: [pendingExecution.broadcastedTransaction.info.hash],
		});

		let finalised = false;
		if (pendingTansaction && pendingTansaction.blockNumber) {
			const latestBlocknumberAshex = await provider.request({
				method: 'eth_blockNumber',
			});
			const latestBlockNumber = parseInt(latestBlocknumberAshex.slice(2), 16);
			const transactionBlockNumber = parseInt(pendingTansaction.blockNumber.slice(2), 16);
			finalised = latestBlockNumber - finality >= transactionBlockNumber;
		}

		if (!pendingTansaction) {
			// TODO resubmit with higher gas
			// const lastMaxFeeUsed = pendingExecution.tx.maxFeePerGasUsed;
			// const broadcastingTime = Math.max(
			// 	pendingExecution.arrivalTimeWanted,
			// 	pendingExecution.startTime + pendingExecution.minDuration
			// );
			// const currentMaxFee = getMaxFeeFromArray(pendingExecution.maxFeesSchedule, getTimestamp() - broadcastingTime);
			// if (!transaction || currentMaxFee.maxFeePerGas.gt(lastMaxFeeUsed)) {
			// 	this.info(
			// 		`broadcast reveal tx for fleet: ${pendingExecution.fleetID} ${
			// 			transaction ? 'with new fee' : 'again as it was lost'
			// 		} ... `
			// 	);
			// 	const {error, tx} = await this._submitTransaction(pendingExecution, {
			// 		forceNonce: pendingExecution.tx.nonce,
			// 		maxFeePerGas: currentMaxFee.maxFeePerGas,
			// 		maxPriorityFeePerGas: currentMaxFee.maxPriorityFeePerGas,
			// 	});
			// 	if (error) {
			// 		// TODO
			// 		this.error(error);
			// 		return;
			// 	} else if (!tx) {
			// 		// impossible
			// 		return;
			// 	}
			// 	pendingExecution.tx = tx;
			// 	db.put<ExecutionPendingTransactionData>(pendingID, pendingExecution);
			// }

			// FOR NOW we just re broadcast
			await _submitTransaction(pendingExecution.broadcastedTransaction.data, {
				forceNonce: pendingExecution.broadcastedTransaction.info.nonce,
				maxFeePerGas: BigInt(pendingExecution.broadcastedTransaction.data.maxFeePerGas),
				maxPriorityFeePerGas: BigInt(pendingExecution.broadcastedTransaction.data.maxPriorityFeePerGas),
			});
		} else if (finalised) {
			// TODO account
			// const txReceipt = await provider.request({
			// 	method: 'eth_getTransactionReceipt',
			// 	params: [pendingExecution.broadcastedTransaction.hash],
			// });
			// const accountID = `account_${pendingExecution.player.toLowerCase()}`;
			// const accountData = await this.state.storage.get<AccountData | undefined>(accountID);
			// if (accountData) {
			// 	const maxFeeAllowed = getMaxFeeAllowed(pendingExecution.maxFeesSchedule);
			// 	const minimumCost = maxFeeAllowed.mul(revealMaxGasEstimate);
			// 	let gasCost = minimumCost;
			// 	if (txReceipt.gasUsed && txReceipt.effectiveGasPrice) {
			// 		gasCost = txReceipt.gasUsed?.mul(txReceipt.effectiveGasPrice);
			// 	}
			// 	const paymentUsed = BigNumber.from((await accountData).paymentUsed).add(gasCost);
			// 	let paymentSpending = BigNumber.from((await accountData).paymentSpending).sub(minimumCost);
			// 	if (paymentSpending.lt(0)) {
			// 		paymentSpending = BigNumber.from(0);
			// 	}
			// 	// TODO move to sync stage ?
			// 	//  could either make every tx go through the payment gateway and emit event there
			// 	//  or do it on OuterSpace by adding an param to the event
			// 	//  we just need payer address and amount reserved (spending)
			// 	//  doing it via event has the advantage that the payment can be tacked back even after full db reset
			// 	//  we could even process a signature from the payer
			// 	//  the system would still require trusting the agent-service, but everything would at least be auditable
			// 	accountData.paymentUsed = paymentUsed.toString();
			// 	accountData.paymentSpending = paymentSpending.toString();
			// 	db.put<AccountData>(accountID, accountData);
			// } else {
			// 	logger.error(`weird, accountData do not exist anymore`); // TODO handle it
			// }

			// the tx has been finalised, we can delete it from the system
			storage.deletePendingExecution(pendingExecution.id, pendingExecution.broadcastedTransaction.data.from, nonce);
		}
	}

	async function processPendingTransactions() {
		// TODO test limit, is 10 good enough ? this will depends on exec time and CRON period and number of tx submitted
		const limit = 10;

		const pendingExecutions = await storage.getPendingExecutions(limit);
		if (pendingExecutions) {
			for (const pendingExecution of pendingExecutions) {
				await __processPendingTransaction(pendingExecution.nonce, pendingExecution);
				// TODO check pending transactions, remove confirmed one, increase gas if queue not moving
				// nonce can be rebalanced too if needed ?
			}
		}
	}

	return {
		submitExecution,
		processQueue,
		processPendingTransactions,
	};
}

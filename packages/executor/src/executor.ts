import {logs} from 'named-logs';
import {BroadcasterData} from './types/executor-storage';
import {ExecutorBackend} from './types/external';
import {
	Executor,
	ExpectedWorstCaseGasPrice,
	ExecutionResponse,
	PendingExecutionStored,
	ExecutionSubmission,
	TransactionParametersUsed,
} from 'fuzd-common';
import {ExecutorConfig} from './types/internal';
import {BroadcasterSignerData, ChainProtocol} from 'fuzd-chain-protocol';

const logger = logs('fuzd-executor');

// TODO (ExecutionToStore): the field `transaction` of type TransactionData should be modified to not need: 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
type ExecutionToStore<T> = Omit<
	PendingExecutionStored<T>,
	'hash' | 'broadcastTime' | 'nextCheckTime' | 'transactionParametersUsed'
>;

export function createExecutor<TransactionDataType>(
	config: ExecutorConfig<TransactionDataType>,
): Executor<TransactionDataType> & ExecutorBackend {
	const {chainProtocols, storage} = config;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	function getExpectedWorstCaseGasPrice(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice> {
		return storage.getExpectedWorstCaseGasPrice(chainId);
	}

	async function getExecutionStatus(executionBatch: {
		chainId: `0x${string}`;
		slot: string;
		account: `0x${string}`;
	}): Promise<'finalized' | 'broadcasted' | undefined> {
		const batch = await storage.getPendingExecutionBatch(executionBatch);
		if (!batch) {
			return undefined;
		}
		for (const exec of batch) {
			if (!exec.finalized) {
				return 'broadcasted';
			}
		}
		return 'finalized';
	}

	async function broadcastExecution(
		slot: string,
		batchIndex: number,
		account: `0x${string}`,
		submission: ExecutionSubmission<TransactionDataType>,
		options?: {
			expectedWorstCaseGasPrice?: bigint;
			asPaymentFor?: {
				chainId: `0x${string}`;
				account: `0x${string}`;
				slot: string;
				batchIndex: number;
				upToGasPrice: bigint;
			};
		},
	): Promise<ExecutionResponse<TransactionDataType>> {
		const chainProtocol = _getChainProtocol(submission.chainId);

		submission = chainProtocol.parseExecutionSubmission(submission);

		const realTimestamp = Math.floor(Date.now() / 1000);

		let expectedWorstCaseGasPrice = options?.expectedWorstCaseGasPrice;
		if (expectedWorstCaseGasPrice == undefined) {
			const expectedWorstCaseGasPriceConfig = await storage.getExpectedWorstCaseGasPrice(submission.chainId);
			const gasPriceTime = expectedWorstCaseGasPriceConfig?.updateTimestamp;
			if (gasPriceTime && expectedWorstCaseGasPriceConfig.current != undefined) {
				expectedWorstCaseGasPrice = expectedWorstCaseGasPriceConfig.current;
				const previous = expectedWorstCaseGasPriceConfig?.previous;
				if (previous != undefined && previous < expectedWorstCaseGasPrice && realTimestamp < gasPriceTime + 30 * 60) {
					expectedWorstCaseGasPrice = previous;
				}
			}
		}

		const existingExecution = await storage.getPendingExecution({
			chainId: submission.chainId,
			account,
			slot,
			batchIndex,
		});
		if (existingExecution) {
			return {...existingExecution, slotAlreadyUsed: true};
		}

		const timestamp = await chainProtocol.getTimestamp();

		const broadcaster = await chainProtocol.assignProviderFor(submission.chainId, account);
		const pendingExecutionToStore: ExecutionToStore<TransactionDataType> = {
			chainId: submission.chainId,
			account,
			slot,
			batchIndex,
			transaction: submission.transaction as TransactionDataType,
			maxFeePerGasAuthorized: submission.maxFeePerGasAuthorized,
			broadcasterAssignerID: broadcaster.assignerID,
			isVoidTransaction: false,
			initialTime: timestamp,
			expiryTime: submission.expiryTime,
			expectedWorstCaseGasPrice:
				expectedWorstCaseGasPrice != undefined ? `0x${expectedWorstCaseGasPrice.toString(16)}` : undefined,
			finalized: false,
		};

		const {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate} = await chainProtocol.getGasFee(submission);

		const result = await _submitTransaction(
			broadcaster,
			pendingExecutionToStore,
			{
				maxFeePerGas,
				maxPriorityFeePerGas,
				gasPriceEstimate: gasPriceEstimate,
			},
			options?.asPaymentFor,
		);
		if (!result) {
			throw new Error(`could not submit transaction, failed`);
		}
		return result;
	}

	async function _getBroadcasterNonce(chainId: `0x${string}`, broadcasterAddress: `0x${string}`) {
		const chainProtocol = _getChainProtocol(chainId);

		const nonceAsHex = await chainProtocol.getNonce(broadcasterAddress);
		const nonce = Number(nonceAsHex);
		if (isNaN(nonce)) {
			throw new Error(`could not parse transaction count while checking for expected nonce`);
		}
		let broadcasterData: BroadcasterData;
		const dataFromStorage = await storage.getBroadcaster({
			chainId: chainId,
			address: broadcasterAddress,
		});
		if (dataFromStorage) {
			broadcasterData = dataFromStorage;
		} else {
			broadcasterData = {chainId: chainId, address: broadcasterAddress, nextNonce: nonce};
		}

		const expectedNonce = broadcasterData.nextNonce;
		return {nonce, expectedNonce};
	}

	async function _getTxParams(
		chainId: `0x${string}`,
		broadcasterAddress: `0x${string}`,
		transactionData: Partial<TransactionDataType>,
	): Promise<
		{expectedNonce: number; nonce: number} & ({revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean})
	> {
		const {expectedNonce, nonce} = await _getBroadcasterNonce(chainId, broadcasterAddress);

		const chainProtocol = _getChainProtocol(chainId);

		const validity = await chainProtocol.checkValidity(broadcasterAddress, transactionData);
		return {...validity, expectedNonce, nonce};
	}

	function _getChainProtocol(chainId: `0x${string}`): ChainProtocol {
		const chainProtocol = chainProtocols[chainId];
		if (!chainProtocol) {
			throw new Error(`cannot get protocol for chain with id ${chainId}`);
		}
		return chainProtocol;
	}

	async function _submitTransaction(
		broadcaster: BroadcasterSignerData,
		execution: ExecutionToStore<TransactionDataType>,
		options: {
			forceNonce?: number;
			maxFeePerGas: bigint;
			maxPriorityFeePerGas: bigint;
			forceVoid?: boolean;
			gasPriceEstimate?: {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint};
			previouslyStored?: PendingExecutionStored<TransactionDataType>;
		},
		asPaymentFor?: {
			chainId: `0x${string}`;
			account: `0x${string}`;
			slot: string;
			batchIndex: number;
			upToGasPrice: bigint;
		},
	): Promise<PendingExecutionStored<TransactionDataType> | undefined> {
		// we get broadcast from storage
		// we the pass the broadcaster
		// signTransaction then handle the fetching of estimate, etc...

		const chainProtocol = _getChainProtocol(execution.chainId);
		const txParams = await _getTxParams(execution.chainId, broadcaster.address, execution.transaction);
		if (txParams.revert === true) {
			const errorMessage = `The transaction reverts`;
			logger.error(errorMessage);
			execution.lastError = errorMessage;
			if (options.previouslyStored) {
				// since tx has already been broadcasted, we need to replace it with a successful tx so that further tx can proceed
				// we do that by making a simple void tx
				options.forceVoid = true;
			} else {
				return undefined;
			}
		} else if (txParams.revert === 'unknown') {
			// we keep going anyway
		} else if (txParams.notEnoughGas) {
			const errorMessage = `The transaction requires more gas than provided. Aborting here`;
			logger.error(errorMessage);
			execution.lastError = errorMessage;
			if (options.previouslyStored) {
				// since tx has already been broadcasted, we need to replace it with a successful tx so that further tx can proceed
				// we do that by making a simple void tx
				options.forceVoid = true;
			} else {
				return undefined;
			}
		}

		if (options.forceVoid) {
			// TODO if forceVoid, we can use more gasPrive as long as total do not exceed gas * maxFeePerGasAuthorized
		}

		const expectedNonce = txParams.expectedNonce;
		let nonce = txParams.nonce;
		let nonceIncreased = false;
		if (options.forceNonce) {
			nonce = options.forceNonce;
		} else {
			if (nonce !== expectedNonce) {
				if (nonce > expectedNonce) {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}. this means some tx went through in between`;
					// logger.error(message);
					nonceIncreased = true;
				} else {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}, this means some tx has not been included yet and we should still keep using the exepected value. We prefer to throw and make the user retry`;
					// logger.error(message);
					throw new Error(message);
				}
			}
		}

		// logger.info('checking if tx should still be submitted');
		const already_resolved = false;
		// TODO allow execution of logic
		// To be fair if the tx fails this should be enough
		if (options?.forceVoid || already_resolved) {
			options.forceVoid = true;
			if (nonceIncreased) {
				// return {error: {message: 'nonce increased but fleet already resolved', code: 5502}};
				if (already_resolved) {
					throw new Error(`nonce increased but already resolved. we can skip`);
					// TODO delete instead of error ?
				} else {
					throw new Error(
						`nonce increased but already resolved. this should never happen since forceNonce should have been used here`,
					);
				}
			}
		}

		const maxFeePerGas = options.maxFeePerGas;

		// this fix ancient8 testnet
		// TODO investigate more robust ways to handle this
		const maxPriorityFeePerGasTMP = options.maxPriorityFeePerGas == 0n ? 10n : options.maxPriorityFeePerGas;

		// then we ensure maxPriorityFeePerGas do not exceeed maxFeePerGas
		const maxPriorityFeePerGas = maxPriorityFeePerGasTMP > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGasTMP;
		const maxFeePerGasAs0xString = `0x${maxFeePerGas.toString(16)}` as `0x${string}`;
		const maxPriorityFeePerGasAs0xString = `0x${maxPriorityFeePerGas.toString(16)}` as `0x${string}`;

		const transactionParametersUsed: TransactionParametersUsed = {
			maxFeePerGas: maxFeePerGasAs0xString,
			maxPriorityFeePerGas: maxPriorityFeePerGasAs0xString,
			from: broadcaster.address,
			nonce: `0x${nonce.toString(16)}`,
		};

		const rawTxInfo = await chainProtocol.signTransaction<TransactionDataType>(
			execution.chainId,
			execution.transaction,
			broadcaster,
			transactionParametersUsed,
			{forceVoid: options.forceVoid, nonceIncreased: nonceIncreased},
		);

		const retries = typeof execution.retries === 'undefined' ? 0 : execution.retries + 1;

		const timestamp = await chainProtocol.getTimestamp();
		const nextCheckTime = timestamp + 60; // retry in 60 seconds // TODO config

		let lastError: string | undefined;

		if (options.gasPriceEstimate && options.gasPriceEstimate.maxFeePerGas > options.maxFeePerGas) {
			lastError = 'potentially underpriced';
		}

		const newExecution: PendingExecutionStored<TransactionDataType> = {
			chainId: execution.chainId,
			transaction: execution.transaction, // we never change it, all data changed are captured by : transactionParametersUsed
			transactionParametersUsed: transactionParametersUsed,
			maxFeePerGasAuthorized: execution.maxFeePerGasAuthorized,
			initialTime: execution.initialTime,
			expiryTime: execution.expiryTime,
			slot: execution.slot,
			batchIndex: execution.batchIndex,
			account: execution.account,
			expectedWorstCaseGasPrice: execution.expectedWorstCaseGasPrice,
			finalized: execution.finalized,
			hash: rawTxInfo.hash,
			broadcastTime: timestamp,
			nextCheckTime,
			retries,
			broadcasterAssignerID: broadcaster.assignerID,
			isVoidTransaction: rawTxInfo.isVoidTransaction,
			lastError,
		};
		await storage.createOrUpdatePendingExecution(newExecution, asPaymentFor);

		try {
			await chainProtocol.broadcastSignedTransaction(rawTxInfo.rawTx);
		} catch (err) {
			logger.error(`The broadcast failed, we attempts one more time`, err);
			try {
				await chainProtocol.broadcastSignedTransaction(rawTxInfo.rawTx);
			} catch (err) {
				let errorString: string;
				try {
					if (err && typeof err === 'object') {
						if ('message' in err) {
							errorString = err.message as string;
						} else if ('toString' in err) {
							errorString = err.toString();
						} else {
							errorString = String(err);
						}
					} else {
						errorString = String(err);
					}
				} catch {
					errorString = 'failed to parse error';
				}

				newExecution.lastError = errorString;

				await storage.createOrUpdatePendingExecution(newExecution);
				logger.error(
					`The broadcast failed again but we ignore it as we are going to handle it when processing recorded transactions.`,
					err,
				);
			}
		}

		return newExecution;
	}

	async function _resubmitIfNeeded(pendingExecution: PendingExecutionStored<TransactionDataType>): Promise<void> {
		const chainProtocol = _getChainProtocol(pendingExecution.chainId);
		const timestamp = await chainProtocol.getTimestamp();
		const diffSinceInitiated = timestamp - pendingExecution.initialTime;

		let forceVoid = false;
		if ((pendingExecution.expiryTime && pendingExecution.expiryTime < timestamp) || diffSinceInitiated > maxExpiry) {
			// since tx has already been broadcasted, we need to replace it with a successful tx so that further tx can proceed
			// we do that by making a simple void tx
			forceVoid = true;
		}

		let {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate} = await chainProtocol.getGasFee(pendingExecution);

		if (gasPriceEstimate.maxFeePerGas > maxFeePerGas) {
			const expectedWorstCaseGasPrice = pendingExecution.expectedWorstCaseGasPrice
				? BigInt(pendingExecution.expectedWorstCaseGasPrice)
				: undefined;

			if (expectedWorstCaseGasPrice != undefined && expectedWorstCaseGasPrice < gasPriceEstimate.maxFeePerGas) {
				let diffToCover = gasPriceEstimate.maxFeePerGas - expectedWorstCaseGasPrice;
				// this only cover all if user has send that expectedWorstCaseGasPrice value on
				if (maxFeePerGas < expectedWorstCaseGasPrice) {
					// show warning then
					logger.warn(`user has provided a lower maxFeePerGas than expected, we won't pay more`);
				}

				const upToGasPrice = maxFeePerGas + diffToCover;

				if (pendingExecution.helpedForUpToGasPrice) {
					diffToCover -= BigInt(pendingExecution.helpedForUpToGasPrice) - maxFeePerGas;
				}

				if (diffToCover > 0n) {
					const paymentAccount = config.paymentAccount;
					if (paymentAccount) {
						const broadcaster = await chainProtocol.assignProviderFor(pendingExecution.chainId, paymentAccount);
						const broadcasterBalance = await chainProtocol.getBalance(broadcaster.address);
						const {transaction, cost} = chainProtocol.generatePaymentTransaction(
							pendingExecution.transaction,
							gasPriceEstimate.maxFeePerGas,
							pendingExecution.transactionParametersUsed.from,
							diffToCover,
						);

						if (cost <= broadcasterBalance) {
							const execution: ExecutionSubmission<TransactionDataType> = {
								chainId: pendingExecution.chainId,
								maxFeePerGasAuthorized: `0x38D7EA4C68000`, // 1000 gwei // TODO CONFIGURE per network: max worst worst case
								transaction: transaction,
							};
							await broadcastExecution(
								`${pendingExecution.account}_${pendingExecution.transactionParametersUsed.from}_${pendingExecution.transactionParametersUsed.nonce}_${gasPriceEstimate.maxFeePerGas.toString()}`,
								0,
								paymentAccount,
								execution,
								{
									asPaymentFor: {
										chainId: pendingExecution.chainId,
										account: pendingExecution.account,
										slot: pendingExecution.slot,
										batchIndex: pendingExecution.batchIndex,
										upToGasPrice: gasPriceEstimate.maxFeePerGas,
									},
								},
							);
							maxFeePerGas = upToGasPrice;
							maxPriorityFeePerGas = maxFeePerGas;
						} else {
							logger.error(`paymentAccount broadcaster balance to low! (${broadcaster.address})`);
						}
					}
				}
			}
		}

		const maxFeePerGasUsed = BigInt(pendingExecution.transactionParametersUsed.maxFeePerGas);
		const maxPriorityFeePerGasUsed = BigInt(pendingExecution.transactionParametersUsed.maxFeePerGas);

		let transactionIsPending = await chainProtocol.isTransactionPending(pendingExecution.hash);

		if (
			!transactionIsPending ||
			maxFeePerGasUsed < maxFeePerGas ||
			(maxFeePerGasUsed === maxFeePerGas && maxPriorityFeePerGasUsed < maxPriorityFeePerGas)
		) {
			const signer = await chainProtocol.getProviderByAssignerID(
				pendingExecution.broadcasterAssignerID,
				pendingExecution.account,
			);
			if (!signer) {
				// TODO
			}
			logger.log(
				`resubmit with maxFeePerGas: ${maxFeePerGas} and maxPriorityFeePerGas: ${maxPriorityFeePerGas} \n(maxFeePerGasUsed: ${maxFeePerGasUsed}, maxPriorityFeePerGasUsed: ${maxPriorityFeePerGasUsed})`,
			);
			await _submitTransaction(signer, pendingExecution, {
				forceNonce: Number(pendingExecution.transactionParametersUsed.nonce),
				maxFeePerGas,
				maxPriorityFeePerGas,
				gasPriceEstimate: gasPriceEstimate,
				previouslyStored: pendingExecution,
				forceVoid,
			});
		}
	}

	async function __processPendingTransaction(
		pendingExecution: PendingExecutionStored<TransactionDataType>,
	): Promise<void> {
		const chainProtocol = _getChainProtocol(pendingExecution.chainId);

		const txStatus = await chainProtocol.isTransactionFinalised(pendingExecution.hash);
		if (txStatus.finalised) {
			pendingExecution.finalized = true;
			storage.createOrUpdatePendingExecution(pendingExecution);
		} else if (!txStatus.pending) {
			await _resubmitIfNeeded(pendingExecution);
		}
	}

	async function processPendingTransactions() {
		const limit = maxNumTransactionsToProcessInOneGo;

		const pendingExecutions = await storage.getPendingExecutions({limit});
		if (pendingExecutions.length === 0) {
			logger.info(`found zero transactions`);
		} else if (pendingExecutions.length === 1) {
			logger.info(`found 1 transaction`);
		} else {
			logger.info(`found ${pendingExecutions.length} transactions`);
		}
		if (pendingExecutions) {
			for (const pendingExecution of pendingExecutions) {
				try {
					await __processPendingTransaction(pendingExecution);
				} catch (err) {
					logger.error(`failed to process pending tx`, pendingExecution, err);
				}
			}
		}
		// TODO make returning the pending transaction part of the api
		return pendingExecutions as unknown as void;
	}

	return {
		broadcastExecution,
		getExecutionStatus,
		getExpectedWorstCaseGasPrice,
		processPendingTransactions,
	};
}

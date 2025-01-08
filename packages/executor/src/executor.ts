import {logs} from 'named-logs';
import {BroadcasterData} from './types/executor-storage.js';
import {ExecutorBackend} from './types/external.js';
import {
	Executor,
	ExecutionResponse,
	PendingExecutionStored,
	ExecutionSubmission,
	TransactionParametersUsed,
	String0x,
	numToHex,
	bigintToHex,
	RemoteAccountInfo,
	ExecutionServiceParameters,
	UpdateableParameters,
	validateParameters,
} from 'fuzd-common';
import {ExecutorConfig} from './types/internal.js';
import {BroadcasterSignerData, ChainProtocol, SignedTransactionInfo, TransactionDataTypes} from 'fuzd-chain-protocol';

const logger = logs('fuzd-executor');

type ExecutionToStore<T> = Omit<
	PendingExecutionStored<T>,
	'hash' | 'broadcastTime' | 'nextCheckTime' | 'transactionParametersUsed'
>;

export function createExecutor<ChainProtocolTypes extends ChainProtocol<any>>(
	config: ExecutorConfig<ChainProtocolTypes>,
): Executor<TransactionDataTypes<ChainProtocolTypes>> & ExecutorBackend {
	type TransactionDataType = TransactionDataTypes<ChainProtocolTypes>;

	const {chainProtocols, storage} = config;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	async function getServiceParameters(chainId: String0x): Promise<UpdateableParameters<ExecutionServiceParameters>> {
		const chainProtocol = _getChainProtocol(chainId);
		const derivationParameters = await chainProtocol.getDerivationParameters(config.serverAccount);
		const expectedWorstCaseGasPrice = await storage.getExpectedWorstCaseGasPrice(chainId);
		// TODO
		// const fees = await storage.getFees(chainId);
		const fees = {
			current: {
				fixed: '0',
				per_1000_000: 0,
			},
			updateTimestamp: 0,
			previous: undefined,
		};
		return {
			derivationParameters: {current: derivationParameters, updateTimestamp: 0, previous: undefined},
			expectedWorstCaseGasPrice,
			fees: fees,
		};
	}

	async function getExecutionStatus(executionBatch: {
		chainId: String0x;
		slot: string;
		account: String0x;
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

	async function getRemoteAccount(chainId: String0x, account: String0x): Promise<RemoteAccountInfo> {
		const serviceParameters = await getServiceParameters(chainId);
		const chainProtocol = _getChainProtocol(chainId);
		const broadcaster = await chainProtocol.getBroadcaster(
			config.serverAccount,
			serviceParameters.derivationParameters.current,
			account,
		);
		return {
			serviceParameters: {
				derivationParameters: serviceParameters.derivationParameters.current,
				expectedWorstCaseGasPrice: serviceParameters.expectedWorstCaseGasPrice?.current,
				fees: serviceParameters.fees.current,
			},
			address: broadcaster.address,
		};
	}

	async function broadcastExecution(
		slot: string,
		batchIndex: number,
		account: String0x,
		submission: ExecutionSubmission<TransactionDataType>,
		serviceParameters: ExecutionServiceParameters,
		options?: {
			trusted?: boolean;
			asPaymentFor?: {
				chainId: String0x;
				account: String0x;
				slot: string;
				batchIndex: number;
				upToGasPrice: bigint;
			};
		},
	): Promise<ExecutionResponse<TransactionDataType>> {
		const chainProtocol = _getChainProtocol(submission.chainId);

		const realTimestamp = Math.floor(Date.now() / 1000);

		if (!options?.trusted) {
			const allowedParameters = await getServiceParameters(submission.chainId);
			if (!validateParameters(serviceParameters, allowedParameters, realTimestamp)) {
				throw new Error(`provided parameters do not match the current or previous parameters`);
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

		const validation = await chainProtocol.validateDerivationParameters(serviceParameters.derivationParameters);

		if (!validation.success) {
			throw new Error(validation.error);
		}

		const broadcaster = await chainProtocol.getBroadcaster(
			config.serverAccount,
			serviceParameters.derivationParameters,
			account,
		);

		if (
			!slot.startsWith(`_INTERNAL_preliminary_`) &&
			'requiredPreliminaryTransaction' in chainProtocol &&
			chainProtocol.requiredPreliminaryTransaction
		) {
			const broadcasterFromStorage = await storage.getBroadcaster({
				chainId: submission.chainId,
				address: broadcaster.address,
			});
			let initial = false;
			if (broadcasterFromStorage) {
				initial = broadcasterFromStorage.nextNonce == 0;
			} else {
				const networkNonce = await chainProtocol.getNonce(broadcaster.address);
				initial = Number(networkNonce) == 0;
			}
			if (initial) {
				const preliminaryTransaction = chainProtocol.requiredPreliminaryTransaction(
					submission.chainId,
					broadcaster,
					account,
				);
				const batchIndex = 0;
				// TODO : consider cost of this for first execution
				// console.log(`broadcastExecution...`, preliminaryTransaction);
				// TODO ensure _INTERNAL_ prefixed slots cannot be used
				const txInfo = await broadcastExecution(
					`_INTERNAL_preliminary_${broadcaster.address}`,
					batchIndex,
					account,
					{
						chainId: submission.chainId,
						maxFeePerGasAuthorized: submission.maxFeePerGasAuthorized,
						transaction: preliminaryTransaction,
						expiryTime: submission.expiryTime,
						onBehalf: submission.onBehalf,
						// TODO force nonce or indicate it only make sense if first transaction, as there are potential race condition here
						// having said that, the initial tx need to be performed anyway so there should not be any other at the same time
					},
					serviceParameters,
					{trusted: true}, // we just validated it
				);

				// console.log(`preliminary broadcasted`, txInfo);
			}
		}

		const pendingExecutionToStore: ExecutionToStore<TransactionDataType> = {
			chainId: submission.chainId,
			account,
			slot,
			batchIndex,
			serviceParameters,
			transaction: submission.transaction as TransactionDataType,
			maxFeePerGasAuthorized: submission.maxFeePerGasAuthorized,
			isVoidTransaction: false,
			initialTime: timestamp,
			expiryTime: submission.expiryTime,
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

	// --------------------------------------------------------------------------------------------
	// INTERNAL
	// --------------------------------------------------------------------------------------------

	async function _acquireBroadcaster(chainId: String0x, broadcasterAddress: String0x) {
		const chainProtocol = _getChainProtocol(chainId);

		const nonceAsHex = await chainProtocol.getNonce(broadcasterAddress);
		const currentNonceAsPerNetwork = Number(nonceAsHex);
		if (isNaN(currentNonceAsPerNetwork)) {
			throw new Error(`could not parse transaction count while checking for expected nonce`);
		}
		const dataFromStorage = await storage.lockBroadcaster({
			chainId: chainId,
			address: broadcasterAddress,
			nonceFromNetwork: currentNonceAsPerNetwork,
		});

		if (!dataFromStorage) {
			console.error(`could not lock broadcaster`);
			throw new Error(`could not lock broadcaster`);
		}

		const expectedNonce = dataFromStorage.nextNonce;
		// console.log({expectedNonce, broadcasterAddress});
		return {currentNonceAsPerNetwork, expectedNonce};
	}

	function _getChainProtocol(chainId: String0x): ChainProtocol<any> {
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
			chainId: String0x;
			account: String0x;
			slot: string;
			batchIndex: number;
			upToGasPrice: bigint;
		},
	): Promise<PendingExecutionStored<TransactionDataType> | undefined> {
		const chainProtocol = _getChainProtocol(execution.chainId);
		const {expectedNonce, currentNonceAsPerNetwork} = await _acquireBroadcaster(execution.chainId, broadcaster.address);

		try {
			// console.log({expectedNonce, forceNonce: options.forceNonce});

			let nonce = expectedNonce;
			let noncePassedAlready = false;
			if (typeof options.forceNonce !== 'undefined') {
				// This is a resubmit, so we reuse the same nonce and do not use latesty
				nonce = options.forceNonce;
			} else {
				if (nonce !== currentNonceAsPerNetwork) {
					if (currentNonceAsPerNetwork > nonce) {
						const message = `nonce not matching, network nonce is ${currentNonceAsPerNetwork}, but expected nonce is ${nonce}. this means some tx went through in between`;
						// logger.error(message);
						noncePassedAlready = true;
					} else {
						const message = `nonce not matching, network nonce is ${currentNonceAsPerNetwork}, but expected nonce is ${nonce}, this means some tx has not been included yet and we should still keep using the exepected value.`;
						logger.error(message);
					}
				}
			}

			// logger.info('checking if tx should still be submitted');
			const already_resolved = false;
			// TODO allow execution of logic
			// To be fair if the tx fails this should be enough
			// But there might be cases where a tx do not fail and the use would prefer to completely avoid the tx to be published
			if (options?.forceVoid || already_resolved) {
				options.forceVoid = true;
				if (noncePassedAlready) {
					// return {error: {message: 'nonce increased but fleet already resolved', code: 5502}};
					if (already_resolved) {
						throw new Error(`nonce already passed but already resolved. we can skip`);
						// TODO delete instead of error ?
					} else {
						throw new Error(
							`nonce already passed but not already resolved. this should never happen since forceNonce should have been used here`,
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
			const maxFeePerGasAs0xString = bigintToHex(maxFeePerGas);
			const maxPriorityFeePerGasAs0xString = bigintToHex(maxPriorityFeePerGas);

			const transactionParametersUsed: TransactionParametersUsed = {
				maxFeePerGas: maxFeePerGasAs0xString,
				maxPriorityFeePerGas: maxPriorityFeePerGasAs0xString,
				from: broadcaster.address,
				nonce: numToHex(nonce),
			};

			const validity = await chainProtocol.checkValidity(
				execution.chainId,
				execution.transaction,
				broadcaster,
				transactionParametersUsed,
			);

			if (validity.revert === true) {
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
			} else if (validity.revert === 'unknown') {
				// we keep going anyway
			} else if (validity.notEnoughGas) {
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

			// TODO if noncePassedAlready
			//
			let rawTxInfo: SignedTransactionInfo;
			let isVoidTransaction = false;
			if (options.forceVoid && 'signVoidTransaction' in chainProtocol && chainProtocol.signVoidTransaction) {
				rawTxInfo = await chainProtocol.signVoidTransaction(execution.chainId, broadcaster, transactionParametersUsed);
				isVoidTransaction = true;
			} else {
				rawTxInfo = await chainProtocol.signTransaction(
					execution.chainId,
					execution.transaction,
					broadcaster,
					transactionParametersUsed,
				);
			}

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
				serviceParameters: execution.serviceParameters,
				maxFeePerGasAuthorized: execution.maxFeePerGasAuthorized,
				initialTime: execution.initialTime,
				expiryTime: execution.expiryTime,
				slot: execution.slot,
				batchIndex: execution.batchIndex,
				account: execution.account,
				finalized: execution.finalized,
				hash: rawTxInfo.hash,
				broadcastTime: timestamp,
				nextCheckTime,
				retries,
				isVoidTransaction,
				lastError,
			};
			await storage.createOrUpdatePendingExecution(newExecution, {updateNonceIfNeeded: true}, asPaymentFor);

			try {
				await chainProtocol.broadcastSignedTransaction(rawTxInfo.rawTx);
			} catch (err) {
				logger.error(`The broadcast failed, we attempts one more time`, err);
				try {
					await chainProtocol.broadcastSignedTransaction(rawTxInfo.rawTx);
				} catch (err) {
					// console.error('ERROR', err);
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

					await storage.createOrUpdatePendingExecution(newExecution, {updateNonceIfNeeded: false});
					logger.error(
						`The broadcast failed again but we ignore it as we are going to handle it when processing recorded transactions.`,
						err,
					);
				}
			}

			return newExecution;
		} catch (err) {
			console.error(`failed to execute, removing lock on broadcaster...`);
			await storage.unlockBroadcaster({
				chainId: execution.chainId,
				address: broadcaster.address,
			});
			throw err;
		}
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
			const expectedWorstCaseGasPrice = pendingExecution.serviceParameters.expectedWorstCaseGasPrice
				? BigInt(pendingExecution.serviceParameters.expectedWorstCaseGasPrice)
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
						const broadcaster = await chainProtocol.getBroadcaster(
							config.serverAccount,
							pendingExecution.serviceParameters.derivationParameters,
							paymentAccount,
						);
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
									...pendingExecution.serviceParameters,
									// we do not pay fees here
									fees: {
										fixed: '0',
										per_1000_000: 0,
									},
								},
								{
									trusted: true, // this was validated when pendingExecution was submitted
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
			const broadcaster = await chainProtocol.getBroadcaster(
				config.serverAccount,
				pendingExecution.serviceParameters.derivationParameters,
				pendingExecution.account,
			);
			if (!broadcaster) {
				// TODO
			}
			logger.log(
				`resubmit with maxFeePerGas: ${maxFeePerGas} and maxPriorityFeePerGas: ${maxPriorityFeePerGas} \n(maxFeePerGasUsed: ${maxFeePerGasUsed}, maxPriorityFeePerGasUsed: ${maxPriorityFeePerGasUsed})`,
			);
			// console.log(pendingExecution.transactionParametersUsed);
			await _submitTransaction(broadcaster, pendingExecution, {
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

		const txStatus = await chainProtocol.getTransactionStatus({
			hash: pendingExecution.hash,
			nonce: pendingExecution.transactionParametersUsed.nonce,
		});
		if (!txStatus.success) {
			throw txStatus.error;
		}
		if (txStatus.finalised) {
			pendingExecution.finalized = true;
			storage.createOrUpdatePendingExecution(pendingExecution, {updateNonceIfNeeded: false});
		} else if (!txStatus.pending) {
			await _resubmitIfNeeded(pendingExecution);
		}
	}

	// --------------------------------------------------------------------------------------------

	// --------------------------------------------------------------------------------------------
	// EXPORT
	// --------------------------------------------------------------------------------------------
	return {
		getRemoteAccount,
		broadcastExecution,
		getExecutionStatus,
		getServiceParameters,
		processPendingTransactions,
	};
}

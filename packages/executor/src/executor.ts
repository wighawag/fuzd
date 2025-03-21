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
	IntegerString,
	FUZDLogger,
} from 'fuzd-common';
import {ExecutorConfig} from './types/internal.js';
import {BroadcasterSignerData, ChainProtocol, SignedTransactionInfo, TransactionDataTypes} from 'fuzd-chain-protocol';

const logger = <FUZDLogger>logs('fuzd-executor');

type ExecutionToStore<T> = Omit<
	PendingExecutionStored<T>,
	'hash' | 'broadcastTime' | 'nextCheckTime' | 'transactionParametersUsed'
>;

function computeExecutionIdentifier<T extends any>(execution: ExecutionToStore<T>): string {
	return `${execution.chainId}/${execution.account}/${execution.slot}/${execution.batchIndex}`;
}

// taken from viem
function formatInGwei(v: bigint | string) {
	const decimals = 9;
	const value = typeof v === 'bigint' ? v : BigInt(v);

	let display = value.toString();

	const negative = display.startsWith('-');
	if (negative) display = display.slice(1);

	display = display.padStart(decimals, '0');

	let [integer, fraction] = [display.slice(0, display.length - decimals), display.slice(display.length - decimals)];
	fraction = fraction.replace(/(0+)$/, '');
	return `${negative ? '-' : ''}${integer || '0'}${fraction ? `.${fraction}` : ''} gwei`;
}

export function computeFees(chainId: IntegerString, serviceParameters: ExecutionServiceParameters, maxCost: bigint) {
	if (serviceParameters.fees.fixed !== '0' || serviceParameters.fees.per_1_000_000 > 0) {
		const feesToPay =
			BigInt(serviceParameters.fees.fixed) + (maxCost * BigInt(serviceParameters.fees.per_1_000_000)) / 1000000n;

		let debtDue: bigint = 0n;

		debtDue = feesToPay;

		return {
			feesToPay,
			debtDue,
		};
	}

	return {
		feesToPay: 0n,
		debtDue: 0n,
	};
}

function computeImportanceRatio(data: {
	timestamp: number;
	initialTime: number;
	expiryTime?: number;
	bestTime?: number;
	maxExpiry: number;
}): number {
	const deadline = data.bestTime || data.expiryTime || data.initialTime + data.maxExpiry;
	const totalRange = deadline - data.initialTime;
	if (totalRange <= 0) {
		return 1;
	}
	const timePassed = data.timestamp - data.initialTime;

	if (timePassed <= 0) {
		return 0;
	}

	return timePassed / totalRange;
}

export function createExecutor<ChainProtocolTypes extends ChainProtocol<any>>(
	config: ExecutorConfig<ChainProtocolTypes>,
): Executor<TransactionDataTypes<ChainProtocolTypes>> & ExecutorBackend {
	type TransactionDataType = TransactionDataTypes<ChainProtocolTypes>;

	const {chainProtocols, storage} = config;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	async function getServiceParameters(
		chainId: IntegerString,
	): Promise<UpdateableParameters<ExecutionServiceParameters>> {
		const chainProtocol = _getChainProtocol(chainId);
		const derivationParameters = await chainProtocol.getDerivationParameters(config.serverAccount);

		const chainConfiguration = await storage.getChainConfiguration(chainId);

		const fees = chainConfiguration.fees || {
			current: {
				fixed: '0',
				per_1_000_000: 0,
			},
			updateTimestamp: 0,
			previous: undefined,
		};
		const serviceParameters = {
			derivationParameters: {current: derivationParameters, updateTimestamp: 0, previous: undefined},
			fees,
			expectedWorstCaseGasPrice: chainConfiguration.expectedWorstCaseGasPrice,
		};

		return serviceParameters;
	}

	async function getExecutionStatus(executionBatch: {
		chainId: IntegerString;
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

	async function getRemoteAccount(chainId: IntegerString, account: String0x): Promise<RemoteAccountInfo> {
		const serviceParameters = await getServiceParameters(chainId);

		const chainProtocol = _getChainProtocol(chainId);
		const broadcaster = await chainProtocol.getBroadcaster(
			config.serverAccount,
			serviceParameters.derivationParameters.current,
			account,
		);
		const broadcasterData = await storage.getBroadcaster({chainId, address: broadcaster.address});
		const debt = broadcasterData?.debt || 0n;

		const info: RemoteAccountInfo = {
			serviceParameters: {
				derivationParameters: serviceParameters.derivationParameters.current,
				expectedWorstCaseGasPrice: serviceParameters.expectedWorstCaseGasPrice?.current,
				fees: serviceParameters.fees.current,
			},
			address: broadcaster.address,
			debt: debt.toString(),
		};

		return {
			...info,
			lock: broadcasterData?.lock,
			lock_timestamp: broadcasterData?.lock_timestamp,
			nextNonce: broadcasterData?.nextNonce,
		} as RemoteAccountInfo;
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
				chainId: IntegerString;
				account: String0x;
				slot: string;
				batchIndex: number;
				helpedForUpToGasPrice: {upToGasPrice: bigint; valueSent: bigint};
			};
			onBehalf?: String0x;
			expiryTime?: number;
			initialTime?: number;
		},
	): Promise<ExecutionResponse<TransactionDataType>> {
		const chainProtocol = _getChainProtocol(submission.chainId);

		const realTimestamp = Math.floor(Date.now() / 1000);

		if (!options?.trusted) {
			const allowedParameters = await getServiceParameters(submission.chainId);
			if (!validateParameters(serviceParameters, allowedParameters, realTimestamp)) {
				throw new Error(
					`provided parameters do not match the current or previous parameters` +
						JSON.stringify({serviceParameters, allowedParameters}, null, 2),
				);
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

						// TODO force nonce or indicate it only make sense if first transaction, as there are potential race condition here
						// having said that, the initial tx need to be performed anyway so there should not be any other at the same time
					},
					serviceParameters,
					{trusted: true, onBehalf: options?.onBehalf, expiryTime: options?.expiryTime}, // we just validated it
				);

				// console.log(`preliminary broadcasted`, txInfo);
			}
		}

		const initialTime = options?.initialTime || timestamp;
		const pendingExecutionToStore: ExecutionToStore<TransactionDataType> = {
			chainId: submission.chainId,
			account,
			slot,
			batchIndex,
			serviceParameters,
			transaction: submission.transaction as TransactionDataType,
			maxFeePerGasAuthorized: submission.maxFeePerGasAuthorized,
			isVoidTransaction: false,
			initialTime,
			bestTime: submission.criticalDelta ? initialTime + submission.criticalDelta : undefined,
			expiryTime: options?.expiryTime,
			onBehalf: options?.onBehalf,
			finalized: false,
			debtAssigned: '0', // Will be assigned
		};

		const importanceRatio = computeImportanceRatio({
			timestamp,
			initialTime: pendingExecutionToStore.initialTime,
			expiryTime: pendingExecutionToStore.expiryTime,
			maxExpiry,
			bestTime: pendingExecutionToStore.bestTime,
		});
		const {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate} = await chainProtocol.getGasFee(
			submission,
			importanceRatio,
		);

		if (gasPriceEstimate.maxFeePerGas > maxFeePerGas) {
			logger.warn(
				`estimated maxFeePerGas (${formatInGwei(gasPriceEstimate.maxFeePerGas)}) > maxFeePerGas provided (${formatInGwei(maxFeePerGas)}), tx (${submission.chainId}/${account}/${slot}/${batchIndex}) might not be included. we keep the estimated priorityFee (${formatInGwei(maxPriorityFeePerGas)}) if it still under`,
			);
		}

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
			const errorMessage = `could not submit transaction, failed`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		return result;
	}

	async function processPendingTransactions() {
		const limit = maxNumTransactionsToProcessInOneGo;

		const pendingExecutions = await storage.getPendingExecutions({limit});
		if (pendingExecutions.length === 0) {
			// logger.info(`found zero transactions`);
		} else if (pendingExecutions.length === 1) {
			// logger.info(`found 1 transaction`);
		} else {
			// logger.info(`found ${pendingExecutions.length} transactions`);
		}
		if (pendingExecutions) {
			for (const pendingExecution of pendingExecutions) {
				try {
					await __processPendingTransaction(pendingExecution);
				} catch (err: any) {
					logger.error(`failed to process pending execution: ${computeExecutionIdentifier(pendingExecution)}`, {
						error: {
							name: err.name,
							code: err.code,
							status: err.status,
							stack: err.stack,
							cause: err,
						},
					});
				}
			}
		}
		// TODO make returning the pending transaction part of the api
		return pendingExecutions as unknown as void;
	}

	// --------------------------------------------------------------------------------------------
	// INTERNAL
	// --------------------------------------------------------------------------------------------

	async function _acquireBroadcaster(chainId: IntegerString, broadcasterAddress: String0x) {
		const chainProtocol = _getChainProtocol(chainId);

		const nonceAsHex = await chainProtocol.getNonce(broadcasterAddress);
		const currentNonceAsPerNetwork = Number(nonceAsHex);
		if (isNaN(currentNonceAsPerNetwork)) {
			const errorMessage = `could not parse transaction count (${nonceAsHex}) while checking for expected nonce`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		const dataFromStorage = await storage.lockBroadcaster({
			chainId: chainId,
			address: broadcasterAddress,
			nonceFromNetwork: currentNonceAsPerNetwork,
		});

		if (!dataFromStorage) {
			const errorMessage = `could not lock broadcaster ${chainId}/${broadcasterAddress}`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		return {currentNonceAsPerNetwork, broadcasterData: dataFromStorage};
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
			chainId: IntegerString;
			account: String0x;
			slot: string;
			batchIndex: number;
			helpedForUpToGasPrice: {upToGasPrice: bigint; valueSent: bigint};
		},
	): Promise<PendingExecutionStored<TransactionDataType> | undefined> {
		const chainProtocol = _getChainProtocol(execution.chainId);
		const {currentNonceAsPerNetwork, broadcasterData} = await _acquireBroadcaster(
			execution.chainId,
			broadcaster.address,
		);

		const {nextNonce: expectedNonce, debt: currentDebt} = broadcasterData;
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
						const message = `nonce not matching, network nonce is ${currentNonceAsPerNetwork}, but expected nonce is ${nonce}. this means some tx went through in between, execution: ${computeExecutionIdentifier(execution)}`;
						logger.error(message);
						noncePassedAlready = true;
						// TODO test this scenario, but feel safer
						throw new Error(message);
					} else {
						const message = `nonce not matching, network nonce is ${currentNonceAsPerNetwork}, but expected nonce is ${nonce}, this means some tx has not been included yet and we should still keep using the exepected value, execution: ${computeExecutionIdentifier(execution)}`;
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
						const errorMessage = `nonce already passed but already resolved. we can skip`;
						logger.error(errorMessage);
						throw new Error(errorMessage);
						// TODO delete instead of error ?
					} else {
						const errorMessage = `nonce already passed but not already resolved. this should never happen since forceNonce should have been used here`;
						logger.error(errorMessage);
						throw new Error(errorMessage);
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
					logger.warn(`revert, but was previously stored, so we keep going, but we force void`);
					// since tx has already been broadcasted, we need to replace it with a successful tx so that further tx can proceed
					// we do that by making a simple void tx
					options.forceVoid = true;
				} else {
					logger.warn(`revert, we stop here`);
					return undefined;
				}
			} else if (validity.revert === 'unknown') {
				// we keep going anyway
				logger.warn(`unknown error, we stop here`);
			} else if (validity.notEnoughGas) {
				// TODO consider adding gas, as long as maxFeePerGasAuthorized is considered in the calculation
				const errorMessage = `The transaction requires more gas than provided. Aborting here`;
				logger.error(errorMessage);
				execution.lastError = errorMessage;
				if (options.previouslyStored) {
					logger.warn(`not enough gas, was previously stored, so we keep going, but we force void`);
					// since tx has already been broadcasted, we need to replace it with a successful tx so that further tx can proceed
					// we do that by making a simple void tx
					options.forceVoid = true;
				} else {
					logger.warn(`not enough gas, we stop here`);
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
				logger.error(`sending voidTransaction for ${computeExecutionIdentifier(execution)}`);
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

			const balance = await chainProtocol.getBalance(broadcaster.address);
			const maxCostAuthorized = await chainProtocol.computeMaxCostAuthorized(
				execution.chainId,
				execution.transaction,
				execution.maxFeePerGasAuthorized,
			);

			const {feesToPay, debtDue} = computeFees(execution.chainId, execution.serviceParameters, maxCostAuthorized);

			if (!asPaymentFor) {
				if (balance < maxCostAuthorized) {
					const message = `broadcaster:${broadcaster.address}: not emough balance! ${balance} < ${maxCostAuthorized} (${execution.maxFeePerGasAuthorized} * ${execution.transaction.gas})`;
					logger.error(message);
					throw new Error(message);
				} else if (balance < maxCostAuthorized + feesToPay) {
					const message = `broadcaster:${broadcaster.address}: not enough balance due to fees! ${balance} < ${maxCostAuthorized + feesToPay} (${execution.maxFeePerGasAuthorized} * ${execution.transaction.gas}) + ${feesToPay}`;
					logger.error(message);
					throw new Error(message);
				} else if (feesToPay > 0n && balance < maxCostAuthorized + currentDebt + feesToPay) {
					const message = `broadcaster:${broadcaster.address}: not enough balance due to fees and debts! ${balance} < ${maxCostAuthorized + feesToPay + currentDebt} (${execution.maxFeePerGasAuthorized} * ${execution.transaction.gas}) + ${feesToPay} + ${currentDebt}`;
					logger.error(message);
					throw new Error(message);
				}
			} else {
				// we do not check for cost in the case of a payment tx as we assume the payment fund is always enough
				// plus there should be no fees:
				// we enforce it here in case:
				if (feesToPay > 0n) {
					const message = `payment tx should have zero fees`;
					logger.error(message);
					throw new Error(message);
				}
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
				debtAssigned: debtDue.toString(),
				onBehalf: execution.onBehalf,
				bestTime: execution.bestTime,
				helpedForUpToGasPrice: execution.helpedForUpToGasPrice,
			};

			await storage.createOrUpdatePendingExecution(
				newExecution,
				{
					updateNonceIfNeeded: {
						broadcaster: broadcasterData.address,
						lock: broadcasterData.lock,
					},
					debtOffset: debtDue,
				},
				asPaymentFor,
			);

			try {
				await chainProtocol.broadcastSignedTransaction(rawTxInfo.rawTx);
			} catch (err: any) {
				logger.error(
					`The broadcast (${computeExecutionIdentifier(execution)}) failed, we attempts one more time: ${err.message || err}`,
				);

				const errorDueToFeeTooLow = ((err.message || err.toString()) as string).indexOf('feetoolow') != -1;

				if (errorDueToFeeTooLow) {
					// TODO record this and the value
					// then adjust it here + record new parameterUsed
					logger.warn(`feetoolow detected`);
				}

				try {
					await chainProtocol.broadcastSignedTransaction(rawTxInfo.rawTx);
				} catch (err: any) {
					// TODO
					// const errorDueToFeeTooLow = ((err.message || err.toString()) as string).indexOf('feetoolow') != -1;

					// if (errorDueToFeeTooLow) {
					// 	// TODO record this and the value
					// 	// then adjust on next call
					// 	logger.warn(`feetoolow detected`);
					// }

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

					await storage.createOrUpdatePendingExecution(newExecution, {updateNonceIfNeeded: undefined});
					logger.error(
						`The broadcast (${computeExecutionIdentifier(newExecution)}) failed again but we ignore it as we are going to handle it when processing recorded transactions.: ${err.message || err}`,
					);
				}
			}

			return newExecution;
		} catch (err: any) {
			logger.error(`failed to execute, will remove lock in finally clause: ${err.message || err}`);
			throw err;
		} finally {
			await storage.unlockBroadcaster({
				chainId: execution.chainId,
				address: broadcaster.address,
			});
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

		const importanceRatio = computeImportanceRatio({
			timestamp,
			initialTime: pendingExecution.initialTime,
			expiryTime: pendingExecution.expiryTime,
			maxExpiry,
			bestTime: pendingExecution.bestTime,
		});
		let {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate} = await chainProtocol.getGasFee(
			pendingExecution,
			importanceRatio,
		);

		if (gasPriceEstimate.maxFeePerGas > maxFeePerGas) {
			// logger.warn(`network gas fee greater than maxFeePerGas`);
			let expectedWorstCaseGasPrice = pendingExecution.serviceParameters.expectedWorstCaseGasPrice
				? BigInt(pendingExecution.serviceParameters.expectedWorstCaseGasPrice)
				: undefined;

			const serviceParameters = await getServiceParameters(pendingExecution.chainId);
			if (serviceParameters.expectedWorstCaseGasPrice?.current) {
				// we retroactively consider expectedWorstGasPrice if we reduce. we do not affect if we increase
				// TODO config for this behavio ?
				const currentExpectedWorstCaseGasPrice = BigInt(serviceParameters.expectedWorstCaseGasPrice.current);
				if (expectedWorstCaseGasPrice === undefined || currentExpectedWorstCaseGasPrice < expectedWorstCaseGasPrice) {
					expectedWorstCaseGasPrice = currentExpectedWorstCaseGasPrice;
					// logger.warn(`we are using current expectedWorstCaseGasPrice`);
				}
			}

			if (expectedWorstCaseGasPrice != undefined && expectedWorstCaseGasPrice < gasPriceEstimate.maxFeePerGas) {
				logger.warn(
					`network fee (${formatInGwei(gasPriceEstimate.maxFeePerGas)}) greater than expectedWorstCaseGasPrice (${formatInGwei(expectedWorstCaseGasPrice)})`,
				);

				let diffToCover = gasPriceEstimate.maxFeePerGas - expectedWorstCaseGasPrice;
				// this only cover all if user has send that expectedWorstCaseGasPrice value on
				if (maxFeePerGas < expectedWorstCaseGasPrice) {
					// show warning then
					logger.warn(`user has provided a lower maxFeePerGas than expected, we won't pay more`);
				}

				const upToGasPrice = maxFeePerGas + diffToCover;

				let totalValueSent = 0n;
				if (pendingExecution.helpedForUpToGasPrice) {
					totalValueSent = BigInt(pendingExecution.helpedForUpToGasPrice.valueSent);
					diffToCover -= BigInt(pendingExecution.helpedForUpToGasPrice.upToGasPrice) - maxFeePerGas;
				}

				if (diffToCover > 0n) {
					// logger.warn(`we cover for ${diffToCover} with upToGasPrice: ${formatInGwei(upToGasPrice)}...`);
					const paymentAccount = config.paymentAccount;
					if (paymentAccount) {
						const broadcaster = await chainProtocol.getBroadcaster(
							config.serverAccount,
							pendingExecution.serviceParameters.derivationParameters,
							paymentAccount,
						);
						const broadcasterBalance = await chainProtocol.getBalance(broadcaster.address);

						// 1000 gwei // TODO CONFIGURE per network: max worst worst case
						const maxCostAuthorizedForPaymentTx = 1000000000000n;
						const {transaction, cost, valueSent} = chainProtocol.generatePaymentTransaction(
							pendingExecution.transaction,
							maxCostAuthorizedForPaymentTx, // todo should use maxFeePerGasAuthorized below : 0x38D7EA4C68000
							pendingExecution.transactionParametersUsed.from,
							diffToCover,
						);
						totalValueSent += valueSent;

						if (cost <= broadcasterBalance) {
							const execution: ExecutionSubmission<TransactionDataType> = {
								chainId: pendingExecution.chainId,
								maxFeePerGasAuthorized: `0x${maxCostAuthorizedForPaymentTx.toString(16)}` as String0x,
								transaction: transaction,
							};
							await broadcastExecution(
								`payment_${pendingExecution.transactionParametersUsed.from}_${pendingExecution.transactionParametersUsed.nonce}_${gasPriceEstimate.maxFeePerGas.toString()}`,
								0,
								paymentAccount,
								execution,
								{
									...pendingExecution.serviceParameters,
									// we do not pay fees here
									fees: {
										fixed: '0',
										per_1_000_000: 0,
									},
								},
								{
									onBehalf: pendingExecution.transactionParametersUsed.from,
									trusted: true, // this was validated when pendingExecution was submitted
									asPaymentFor: {
										chainId: pendingExecution.chainId,
										account: pendingExecution.account,
										slot: pendingExecution.slot,
										batchIndex: pendingExecution.batchIndex,
										helpedForUpToGasPrice: {upToGasPrice, valueSent: totalValueSent},
									},
									initialTime: timestamp,
									expiryTime: timestamp + 3 * 60, // 3minutes
								},
							);
							// TODO
							// right now the broadcast can fail with low nonce
							// and in that case, the execution will be deleted
							// TODO throw on low nonce // see submiTtransaction
							maxFeePerGas = upToGasPrice;
							maxPriorityFeePerGas = maxFeePerGas;
						} else {
							logger.error(`paymentAccount broadcaster balance too low! (${broadcaster.address})`);
						}
					}
				} else {
					// logger.warn(`nothing to cover...`);
				}
			}
		}

		const maxFeePerGasUsed = BigInt(pendingExecution.transactionParametersUsed.maxFeePerGas);
		const maxPriorityFeePerGasUsed = BigInt(pendingExecution.transactionParametersUsed.maxPriorityFeePerGas);

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
			from: pendingExecution.transactionParametersUsed.from,
			hash: pendingExecution.hash,
			nonce: pendingExecution.transactionParametersUsed.nonce,
		});
		if (!txStatus.success) {
			throw txStatus.error;
		}
		if (txStatus.finalised) {
			if (txStatus.status === 'failed') {
				pendingExecution.lastError = 'FAILED';
				logger.error(`transaction failed and finalized: ${pendingExecution.hash}`);
			} else if (txStatus.status === 'replaced') {
				pendingExecution.lastError = 'REPLACED';
				logger.error(
					`transaction replaced and finalized: ${pendingExecution.hash}, from:${pendingExecution.transactionParametersUsed.from}, nonce:${pendingExecution.transactionParametersUsed.nonce}`,
				);
			} else {
				pendingExecution.lastError = undefined;
			}

			pendingExecution.finalized = true;

			let debtOffset = 0n;
			// the cost of the transaction
			const actualCost = txStatus.cost;

			const debtAssigned = BigInt(pendingExecution.debtAssigned);

			const {debtDue} = computeFees(pendingExecution.chainId, pendingExecution.serviceParameters, txStatus.cost);
			if (debtDue < debtAssigned) {
				debtOffset = debtDue - debtAssigned;
			}

			// now we get the help given in term of gasPrice ceiling the paymentAccount has given
			const valueSent = pendingExecution.helpedForUpToGasPrice
				? BigInt(pendingExecution.helpedForUpToGasPrice.valueSent)
				: 0n;

			if (valueSent > 0n) {
				// now from that we compute the amount given in excess
				const excessGiven = valueSent - actualCost;

				if (excessGiven >= 0) {
					debtOffset += excessGiven;
				}
			}

			await storage.createOrUpdatePendingExecution(pendingExecution, {
				updateNonceIfNeeded: undefined,
				debtOffset,
			});
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

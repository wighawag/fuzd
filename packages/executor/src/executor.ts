import {logs} from 'named-logs';
import {BroadcasterData, PendingExecutionStored} from './types/executor-storage';
import {
	EIP1193Account,
	EIP1193ProviderWithoutEvents,
	EIP1193QUANTITY,
	EIP1193Transaction,
	EIP1193TransactionReceipt,
} from 'eip-1193';
import {
	ExecutionSubmission,
	ExecutorBackend,
	RawTransactionInfo,
	TransactionParams,
	SchemaExecutionSubmission,
} from './types/external';
import {keccak_256} from '@noble/hashes/sha3';
import {
	Executor,
	ExpectedWorstCaseGasPrice,
	getRoughGasPriceEstimate,
	EIP1193TransactionDataUsed,
	EIP1193TransactionToFill,
	toHex,
	fromHex,
} from 'fuzd-common';
import {BroadcasterSignerData, ChainConfig, ExecutorConfig} from './types/internal';

const logger = logs('fuzd-executor');

type ExecutionToStore = Omit<PendingExecutionStored, 'hash' | 'broadcastTime' | 'nextCheckTime' | 'transaction'> & {
	transaction: Omit<EIP1193TransactionDataUsed, 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>;
};

export function createExecutor(
	config: ExecutorConfig,
): Executor<ExecutionSubmission, PendingExecutionStored> & ExecutorBackend {
	const {chainConfigs, time, storage, signers} = config;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;

	function getExpectedWorstCaseGasPrice(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice> {
		return storage.getExpectedWorstCaseGasPrice(chainId);
	}

	async function broadcastExecution(
		slot: string,
		account: EIP1193Account,
		submission: ExecutionSubmission,
		options?: {
			expectedWorstCaseGasPrice: bigint;
		},
	): Promise<PendingExecutionStored> {
		submission = SchemaExecutionSubmission.parse(submission);

		const chainConfig = chainConfigs[submission.chainId];
		if (!chainConfig) {
			throw new Error(`cannot proceed, this executor is not configured to support chain with id ${submission.chainId}`);
		}

		const realTimestamp = Math.floor(Date.now() / 1000);

		let expectedWorstCaseGasPrice = options?.expectedWorstCaseGasPrice;
		if (!expectedWorstCaseGasPrice) {
			const expectedWorstCaseGasPriceConfig = await storage.getExpectedWorstCaseGasPrice(submission.chainId);
			const gasPriceTime = expectedWorstCaseGasPriceConfig?.updateTimestamp;
			if (gasPriceTime && expectedWorstCaseGasPriceConfig.current) {
				expectedWorstCaseGasPrice = expectedWorstCaseGasPriceConfig.current;
				const previous = expectedWorstCaseGasPriceConfig?.previous;
				if (previous && previous < expectedWorstCaseGasPrice && realTimestamp < gasPriceTime + 30 * 60) {
					expectedWorstCaseGasPrice = previous;
				}
			}
		}

		const existingExecution = await storage.getPendingExecution({
			chainId: submission.chainId,
			slot,
			account,
		});
		if (existingExecution) {
			return existingExecution;
		}

		const {provider} = _getChainConfig(submission.chainId);
		const timestamp = await time.getTimestamp(provider);

		const broadcaster = await signers.assignProviderFor(submission.chainId, account);
		const pendingExecutionToStore: ExecutionToStore = {
			chainId: submission.chainId,
			account,
			slot,
			transaction: {...submission.transaction, from: broadcaster.address, chainId: submission.chainId},
			maxFeePerGasAuthorized: submission.maxFeePerGasAuthorized,
			broadcasterAssignerID: broadcaster.assignerID,
			isVoidTransaction: false,
			initialTime: timestamp,
			expiryTime: submission.expiryTime,
			expectedWorstCaseGasPrice: expectedWorstCaseGasPrice?.toString(),
		};

		await _updateFees(pendingExecutionToStore);

		const {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate} = await _getGasFee(provider, submission);

		const result = await _submitTransaction(broadcaster, pendingExecutionToStore, {
			maxFeePerGas,
			maxPriorityFeePerGas,
			gasPriceEstimate: gasPriceEstimate,
		});
		if (!result) {
			throw new Error(`could not submit transaction, failed`);
		}
		return result;
	}

	async function _updateFees(latestTransaction: ExecutionToStore) {
		// TODO
		// logger.log(`TODO update fees of existing pending transactions to ensure new execution get a chance...`);
		// await storage.updateFees(account);
	}

	async function _signTransaction(
		transactionData: EIP1193TransactionToFill,
		account: EIP1193Account,
		broadcaster: BroadcasterSignerData,
		txParams: TransactionParams,
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; forceVoid?: boolean},
	): Promise<RawTransactionInfo> {
		let actualTransactionData: EIP1193TransactionDataUsed;

		const signer = broadcaster.signer;
		const from = broadcaster.address;

		const expectedNonce = txParams.expectedNonce;
		let nonce = txParams.nonce;
		let nonceIncreased = false;
		if (options.forceNonce) {
			nonce = options.forceNonce;
		} else {
			if (nonce !== expectedNonce) {
				if (nonce > expectedNonce) {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}. this means some tx went through in between`;
					logger.error(message);
					nonceIncreased = true;
				} else {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}, this means some tx has not been included yet and we should still keep using the exepected value. We prefer to throw and make the user retry`;
					logger.error(message);
					throw new Error(message);
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

		logger.info('checcking if tx should still be submitted');
		const already_resolved = false;
		// TODO allow execution of logic
		// To be fair if the tx fails this should be enough
		if (options?.forceVoid || already_resolved) {
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
			} else {
				logger.error('already done, sending dummy transaction');

				try {
					// compute maxFeePerGas and maxPriorityFeePerGas to fill the total gas cost  * price that was alocated
					// maybe not fill but increase from previoyus considering current fee and allowance
					actualTransactionData = {
						type: '0x2',
						from: from,
						to: from,
						nonce: `0x${nonce.toString(16)}` as `0x${string}`,
						maxFeePerGas: maxFeePerGasAs0xString,
						maxPriorityFeePerGas: maxPriorityFeePerGasAs0xString,
						chainId: transactionData.chainId,
						gas: `0x${(21000).toString(16)}`,
					};
					const rawTx = await signer.request({
						method: 'eth_signTransaction',
						params: [actualTransactionData],
					});
					return {
						rawTx,
						transactionData: actualTransactionData,
						isVoidTransaction: true,
					};
				} catch (e) {
					logger.error(`FAILED TO SEND DUMMY TX`, e);
					// TODO do something
					throw e;
				}
			}
		} else {
			// TODO if nonceIncreased
			//
			actualTransactionData = {
				type: transactionData.type,
				accessList: transactionData.accessList,
				chainId: transactionData.chainId,
				data: transactionData.data,
				gas: transactionData.gas,
				to: transactionData.to,
				value: transactionData.value,
				nonce: `0x${nonce.toString(16)}` as `0x${string}`,
				from: from,
				maxFeePerGas: maxFeePerGasAs0xString,
				maxPriorityFeePerGas: maxPriorityFeePerGasAs0xString,
			};

			const rawTx = await await signer.request({
				method: 'eth_signTransaction',
				params: [actualTransactionData],
			});
			return {
				rawTx,
				transactionData: actualTransactionData,
				isVoidTransaction: false,
			};
		}
	}

	async function _getTxParams(
		broadcasterAddress: EIP1193Account,
		transactionData: EIP1193TransactionToFill,
	): Promise<TransactionParams> {
		const {provider} = _getChainConfig(transactionData.chainId);

		const nonceAsHex = await provider.request({
			method: 'eth_getTransactionCount',
			params: [broadcasterAddress, 'latest'],
		});
		const nonce = Number(nonceAsHex);
		if (isNaN(nonce)) {
			throw new Error(`could not parse transaction count while checking for expected nonce`);
		}
		let broadcasterData: BroadcasterData;
		const dataFromStorage = await storage.getBroadcaster({
			chainId: transactionData.chainId,
			address: broadcasterAddress,
		});
		if (dataFromStorage) {
			broadcasterData = dataFromStorage;
		} else {
			broadcasterData = {chainId: transactionData.chainId, address: broadcasterAddress, nextNonce: nonce};
		}

		const expectedNonce = broadcasterData.nextNonce;

		let revert = false;
		let gasRequired: `0x${string}`;
		try {
			gasRequired = await provider.request({
				method: 'eth_estimateGas',
				params: [
					{
						from: broadcasterAddress,
						to: transactionData.to!, // "!" needed, need to fix eip-1193
						data: transactionData.data,
						value: transactionData.value,
					},
				],
			});
		} catch (err: any) {
			// TODO error message // viem
			logger.error('The transaction reverts?', err, {
				from: broadcasterAddress,
				to: transactionData.to!, // "!" needed, need to fix eip-1193
				data: transactionData.data,
				value: transactionData.value,
			});
			revert = true;
			gasRequired = '0x' + Number.MAX_SAFE_INTEGER.toString(16);
		}

		return {expectedNonce, nonce, gasRequired: BigInt(gasRequired), revert};
	}

	function _getChainConfig(chainId: `0x${string}`): ChainConfig {
		const chainConfig = chainConfigs[chainId];
		if (!chainConfig) {
			throw new Error(`cannot get config for chain with id ${chainId}`);
		}
		return chainConfig;
	}

	async function _submitTransaction(
		broadcaster: BroadcasterSignerData,
		transactionData: ExecutionToStore,
		options: {
			forceNonce?: number;
			maxFeePerGas: bigint;
			maxPriorityFeePerGas: bigint;
			forceVoid?: boolean;
			gasPriceEstimate?: {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint};
			previouslyStored?: PendingExecutionStored;
		},
	): Promise<PendingExecutionStored | undefined> {
		const {provider} = _getChainConfig(transactionData.chainId);
		const txParams = await _getTxParams(broadcaster.address, transactionData.transaction);
		const {gasRequired, revert} = txParams;

		if (revert) {
			const errorMessage = `The transaction reverts`;
			logger.error(errorMessage);
			transactionData.lastError = errorMessage;
			if (options.previouslyStored) {
				storage.archiveTimedoutExecution(options.previouslyStored);
			} else {
				// TODO partial like before
			}

			return undefined;
		}

		if (gasRequired > BigInt(transactionData.transaction.gas)) {
			const errorMessage = `The transaction requires more gas than provided. Aborting here`;
			logger.error(errorMessage);
			transactionData.lastError = errorMessage;
			if (options.previouslyStored) {
				storage.archiveTimedoutExecution(options.previouslyStored);
			} else {
				// TODO partial like before
			}
			return undefined;
		}

		const rawTxInfo = await _signTransaction(
			transactionData.transaction,
			transactionData.account,
			broadcaster,
			txParams,
			options,
		);
		const hash = toHex(keccak_256(fromHex(rawTxInfo.rawTx)));

		const retries = typeof transactionData.retries === 'undefined' ? 0 : transactionData.retries + 1;

		const timestamp = await time.getTimestamp(provider);
		const nextCheckTime = timestamp + 60; // TODO config

		let lastError: string | undefined;

		if (options.gasPriceEstimate && options.gasPriceEstimate.maxFeePerGas > options.maxFeePerGas) {
			lastError = 'potentially underpriced';
		}

		const newTransactionData: PendingExecutionStored = {
			chainId: rawTxInfo.transactionData.chainId,
			transaction: {...rawTxInfo.transactionData},
			maxFeePerGasAuthorized: transactionData.maxFeePerGasAuthorized,
			initialTime: transactionData.initialTime,
			expiryTime: transactionData.expiryTime,
			slot: transactionData.slot,
			account: transactionData.account,
			hash,
			broadcastTime: timestamp,
			nextCheckTime,
			retries,
			broadcasterAssignerID: broadcaster.assignerID,
			isVoidTransaction: rawTxInfo.isVoidTransaction,
			lastError,
		};
		await storage.createOrUpdatePendingExecution(newTransactionData);

		try {
			await provider.request({
				method: 'eth_sendRawTransaction',
				params: [rawTxInfo.rawTx],
			});
		} catch (err) {
			logger.error(`The broadcast failed, we attempts one more time`, err);
			try {
				await provider.request({
					method: 'eth_sendRawTransaction',
					params: [rawTxInfo.rawTx],
				});
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

				newTransactionData.lastError = errorString;

				await storage.createOrUpdatePendingExecution(newTransactionData);
				logger.error(
					`The broadcast failed again but we ignore it as we are going to handle it when processing recorded transactions.`,
					err,
				);
			}
		}

		return newTransactionData;
	}

	async function _getGasFee(
		provider: EIP1193ProviderWithoutEvents,
		executionData: {maxFeePerGasAuthorized: EIP1193QUANTITY},
	) {
		const maxFeePerGasAuthorized = BigInt(executionData.maxFeePerGasAuthorized);

		// TODO remove duplication maxFeePerGas
		const estimates = await getRoughGasPriceEstimate(provider);
		const gasPriceEstimate = estimates.average;
		let maxFeePerGas = gasPriceEstimate.maxFeePerGas;
		let maxPriorityFeePerGas = gasPriceEstimate.maxPriorityFeePerGas;
		if (gasPriceEstimate.maxFeePerGas > maxFeePerGasAuthorized) {
			logger.warn(
				`fast.maxFeePerGas (${gasPriceEstimate.maxFeePerGas}) > maxFeePerGasChosen (${maxFeePerGasAuthorized}), tx might not be included`,
			);
			maxFeePerGas = maxFeePerGasAuthorized;
			if (maxPriorityFeePerGas > maxFeePerGas) {
				maxPriorityFeePerGas = maxFeePerGas;
			}
			// FOR now
			// maxFeePerGas = gasPriceEstimate.maxFeePerGas;
			// maxPriorityFeePerGas = gasPriceEstimate.maxPriorityFeePerGas;
		}

		return {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate};
	}

	async function _resubmitIfNeeded(pendingExecution: PendingExecutionStored): Promise<void> {
		const {provider, finality, worstCaseBlockTime} = _getChainConfig(pendingExecution.chainId);
		const timestamp = await time.getTimestamp(provider);
		const diffSinceInitiated = timestamp - pendingExecution.initialTime;

		if (pendingExecution.expiryTime && pendingExecution.expiryTime < timestamp) {
			// expired
			storage.archiveTimedoutExecution(pendingExecution);
			return;
		}

		if (diffSinceInitiated > maxExpiry) {
			// expired by maxExpiry
			storage.archiveTimedoutExecution(pendingExecution);
			return;
		}

		const {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate} = await _getGasFee(provider, pendingExecution);

		const transaction = pendingExecution.transaction;
		const maxFeePerGasUsed = BigInt(transaction.maxFeePerGas);
		const maxPriorityFeePerGasUsed = BigInt(transaction.maxFeePerGas);

		let pendingTansaction: EIP1193Transaction | null;
		try {
			pendingTansaction = await provider.request({
				method: 'eth_getTransactionByHash',
				params: [pendingExecution.hash],
			});
		} catch (err) {
			logger.error(`failed to get pending transaction`, err);
			pendingTansaction = null;
		}

		if (
			!pendingTansaction ||
			maxFeePerGasUsed < maxFeePerGas ||
			(maxFeePerGasUsed === maxFeePerGas && maxPriorityFeePerGasUsed < maxPriorityFeePerGas)
		) {
			const signer = await signers.getProviderByAssignerID(
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
				forceNonce: Number(transaction.nonce),
				maxFeePerGas,
				maxPriorityFeePerGas,
				gasPriceEstimate: gasPriceEstimate,
				previouslyStored: pendingExecution,
			});
		}
	}

	async function __processPendingTransaction(pendingExecution: PendingExecutionStored): Promise<void> {
		const {provider, finality, worstCaseBlockTime} = _getChainConfig(pendingExecution.transaction.chainId);

		let receipt: EIP1193TransactionReceipt | null;
		try {
			receipt = await provider.request({
				method: 'eth_getTransactionReceipt',
				params: [pendingExecution.hash],
			});
		} catch (err) {
			logger.error('ERROR fetching receipt', err);
			receipt = null;
		}

		let finalised = false;
		if (receipt) {
			const latestBlocknumberAshex = await provider.request({
				method: 'eth_blockNumber',
			});
			const latestBlockNumber = Number(latestBlocknumberAshex);
			const transactionBlockNumber = Number(receipt.blockNumber);
			finalised = latestBlockNumber - finality >= transactionBlockNumber;
		}

		if (finalised) {
			storage.deletePendingExecution({
				chainId: pendingExecution.transaction.chainId,
				account: pendingExecution.account,
				slot: pendingExecution.slot,
			});
		} else if (!receipt) {
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
		getExpectedWorstCaseGasPrice,
		processPendingTransactions,
	};
}

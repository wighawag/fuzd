import {logs} from 'named-logs';
import {BroadcasterData, EIP1193TransactionDataUsed, PendingExecutionStored} from './types/executor-storage';
import {EIP1193Account, EIP1193TransactionDataOfType2} from 'eip-1193';
import {
	ExecutionSubmission,
	Executor,
	ExecutorBackend,
	ExecutorConfig,
	FeePerGasPeriod,
	RawTransactionInfo,
	TransactionInfo,
} from './types/executor';

const logger = logs('dreveal-executor');

export function createExecutor(config: ExecutorConfig): Executor & ExecutorBackend {
	const {provider, time, storage, getSignerProvider, chainId} = config;
	const finality = config.finality;
	const worstCaseBlockTime = config.worstCaseBlockTime;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;
	const chainIdAsHex = `0x${BigInt(chainId).toString(16)}` as const;

	async function submitTransaction(
		id: string,
		account: EIP1193Account,
		submission: ExecutionSubmission
	): Promise<TransactionInfo> {
		const currentMaxFee = submission.broadcastSchedule[0];

		const result = await _submitTransaction(
			{...submission, account, id},
			{
				maxFeePerGas: BigInt(currentMaxFee.maxFeePerGas),
				maxPriorityFeePerGas: BigInt(currentMaxFee.maxPriorityFeePerGas),
			}
		);
		return result;
	}

	async function _signTransaction(
		transactionData: Omit<EIP1193TransactionDataOfType2, 'nonce' | 'from'>,
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; forceVoid?: boolean}
	): Promise<RawTransactionInfo> {
		let actualTransactionData: EIP1193TransactionDataUsed;
		const broadcasterAddress = '0xFF' as EIP1193Account; // TODO
		const signer = await getSignerProvider(broadcasterAddress);

		let broadcasterData: BroadcasterData;
		const dataFromStorage = await storage.getBroadcaster({address: broadcasterAddress});
		if (dataFromStorage) {
			broadcasterData = dataFromStorage;
		} else {
			const transactionCountAsHex = await provider.request({
				method: 'eth_getTransactionCount',
				params: [broadcasterAddress, 'latest'],
			});
			const transactionCount = parseInt(transactionCountAsHex.slice(2), 16);
			if (isNaN(transactionCount)) {
				throw new Error(`could not parse transactionCount`);
			}
			const dataFromStorage = await storage.getBroadcaster({address: broadcasterAddress});
			if (!dataFromStorage) {
				broadcasterData = {address: broadcasterAddress, nextNonce: transactionCount}; // ensure no duplicate id in the bucket even if exact same boradcastingTime
				await storage.createBroadcaster(broadcasterData);
			} else {
				broadcasterData = dataFromStorage;
			}
		}
		const expectedNonce = broadcasterData.nextNonce;

		// TODO pass it in to remove the await
		const timestamp = await time.getTimestamp();
		let nonceIncreased = false;
		let nonce: number | undefined;
		if (options.forceNonce) {
			nonce = options.forceNonce;
		} else {
			if (!nonce) {
				const nonceAsHex = await provider.request({
					method: 'eth_getTransactionCount',
					params: [broadcasterAddress, 'latest'],
				});
				nonce = parseInt(nonceAsHex.slice(2), 16);
				if (isNaN(nonce)) {
					throw new Error(`could not parse transaction count while checking for expected nonce`);
				}
			}
			if (nonce !== expectedNonce) {
				if (nonce > expectedNonce) {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}, increasing...`;
					console.error(message);
					nonceIncreased = true;
					// return {error: {message, code: 5501}};
				} else {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}`;
					console.error(message);

					// return {error: {message, code: 5501}};
					throw new Error(message);
				}
			}
		}

		if (!nonce) {
			const nonceAsHex = await provider.request({
				method: 'eth_getTransactionCount',
				params: [broadcasterAddress, 'latest'],
			});
			nonce = parseInt(nonceAsHex.slice(2), 16);
			if (isNaN(nonce)) {
				throw new Error(`could not parse transaction count while checking for expected nonce`);
			}
		}

		logger.info('checcking if tx should still be submitted');
		const already_resolved = false;
		// TODO allow execution of logic
		// To be fair if the tx fails this should be enough
		if (options?.forceVoid || already_resolved) {
			if (nonceIncreased) {
				// return {error: {message: 'nonce increased but fleet already resolved', code: 5502}};
				throw new Error(`nonce increased but already resolved`);
			} else {
				logger.error('already done, sending dummy transaction');

				try {
					actualTransactionData = {
						type: '0x2',
						from: broadcasterAddress,
						to: broadcasterAddress,
						nonce: `0x${nonce.toString(16)}` as `0x${string}`,
						maxFeePerGas: `0x${options.maxFeePerGas.toString(16)}` as `0x${string}`,
						maxPriorityFeePerGas: `0x${options.maxPriorityFeePerGas.toString(16)}` as `0x${string}`,
						chainId: chainIdAsHex,
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
			actualTransactionData = {
				...transactionData,
				nonce: `0x${nonce.toString(16)}` as `0x${string}`,
				from: broadcasterAddress,
				maxFeePerGas: '0x',
				maxPriorityFeePerGas: '0x',
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

	async function _submitTransaction(
		transactionData: Omit<
			PendingExecutionStored,
			'from' | 'hash' | 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'broadcastTime'
		>,
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; forceVoid?: boolean}
	): Promise<TransactionInfo> {
		const rawTxInfo = await _signTransaction(transactionData, options);
		const hash = '0xTODO';

		const retries = typeof transactionData.retries === 'undefined' ? 0 : transactionData.retries + 1;

		const timestamp = await time.getTimestamp();

		const newTransactionData: PendingExecutionStored = {
			...rawTxInfo.transactionData,
			broadcastSchedule: transactionData.broadcastSchedule,
			id: transactionData.id,
			account: transactionData.account,
			hash,
			broadcastTime: timestamp,
			retries,
		};
		storage.createPendingExecution(newTransactionData);

		await provider.request({method: 'eth_sendRawTransaction', params: [rawTxInfo.rawTx]});

		return {
			transactionData: rawTxInfo.transactionData,
			hash,
			broadcastTime: timestamp,
			isVoidTransaction: rawTxInfo.isVoidTransaction,
		};
	}

	async function _resubmitIfNeeded(pendingExecution: PendingExecutionStored): Promise<void> {
		const timestamp = await time.getTimestamp();
		const diff = timestamp - pendingExecution.broadcastTime;

		// TODO validation aty submission time
		// TODO also we need to limit the size of the array of schedule
		// TODO we also need to ensure fee are in increasing order
		if (pendingExecution.broadcastSchedule.length === 0) {
			throw new Error(`should not have let this tx go through, do not have gas params`);
		}
		let feeSlot: FeePerGasPeriod | undefined;
		let total = 0;
		for (let i = 0; i < pendingExecution.broadcastSchedule.length; i++) {
			const currentSlot = pendingExecution.broadcastSchedule[i];
			if (total <= diff) {
				feeSlot = currentSlot;
			}
			total += parseInt(currentSlot.duration.slice(2), 16);
		}

		if (!feeSlot) {
			// we do not have more to resubmit
			return;
		}

		const maxFeePerGas = BigInt(feeSlot.maxFeePerGas);
		const maxPriorityFeePerGas = BigInt(feeSlot.maxPriorityFeePerGas);

		const maxFeePerGasUsed = BigInt(pendingExecution.maxFeePerGas);
		const maxPriorityFeePerGasUsed = BigInt(pendingExecution.maxFeePerGas);

		const pendingTansaction = await provider.request({
			method: 'eth_getTransactionByHash',
			params: [pendingExecution.hash],
		});

		if (
			!pendingTansaction ||
			maxFeePerGasUsed < maxFeePerGas ||
			(maxFeePerGasUsed === maxFeePerGas && maxPriorityFeePerGasUsed < maxPriorityFeePerGas)
		) {
			await _submitTransaction(pendingExecution, {
				forceNonce: parseInt(pendingExecution.nonce.slice(2), 16),
				maxFeePerGas,
				maxPriorityFeePerGas,
			});
		}
	}

	async function __processPendingTransaction(pendingExecution: PendingExecutionStored): Promise<void> {
		const receipt = await provider.request({
			method: 'eth_getTransactionReceipt',
			params: [pendingExecution.hash],
		});

		let finalised = false;
		if (receipt) {
			const latestBlocknumberAshex = await provider.request({
				method: 'eth_blockNumber',
			});
			const latestBlockNumber = parseInt(latestBlocknumberAshex.slice(2), 16);
			const transactionBlockNumber = parseInt(receipt.blockNumber.slice(2), 16);
			finalised = latestBlockNumber - finality >= transactionBlockNumber;
		}

		if (finalised) {
			storage.deletePendingExecution(pendingExecution);
		} else if (!receipt) {
			await _resubmitIfNeeded(pendingExecution);
		}
	}

	async function processPendingTransactions() {
		const limit = maxNumTransactionsToProcessInOneGo;

		const pendingExecutions = await storage.getPendingExecutions({limit});
		if (pendingExecutions) {
			for (const pendingExecution of pendingExecutions) {
				await __processPendingTransaction(pendingExecution);
			}
		}
	}

	return {
		submitTransaction,
		processPendingTransactions,
	};
}

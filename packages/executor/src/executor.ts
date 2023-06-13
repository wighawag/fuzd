import {logs} from 'named-logs';
import {
	BroadcasterData,
	EIP1193TransactionDataUsed,
	ExecutionTransactionData,
	PendingExecutionStored,
} from './types/executor-storage';
import {EIP1193Account, EIP1193TransactionData, EIP1193TransactionDataOfType2} from 'eip-1193';
import {Executor, ExecutorBackend, ExecutorConfig, RawTransactionInfo, TransactionInfo} from './types/executor';
import {FeeStrategy} from './types/common';

const logger = logs('dreveal-executor');

export function createExecutor(config: ExecutorConfig): Executor & ExecutorBackend {
	const {provider, time, storage, getSignerProvider, chainId} = config;
	const finality = config.finality;
	const worstCaseBlockTime = config.worstCaseBlockTime;
	const maxExpiry = (config.maxExpiry = 24 * 3600);
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;
	const chainIdAsHex = `0x${BigInt(chainId).toString(16)}` as const;

	async function submitTransaction(
		id: string,
		account: EIP1193Account,
		executionTransactionData: ExecutionTransactionData,
		feeStrategy: FeeStrategy
	): Promise<TransactionInfo> {
		// TODO fee strategies
		const currentMaxFee = feeStrategy;

		const result = await _submitTransaction(
			{...executionTransactionData, account, id},
			{
				maxFeePerGas: currentMaxFee.maxFeePerGas,
				maxPriorityFeePerGas: currentMaxFee.maxPriorityFeePerGas,
			}
		);
		return result;
	}

	async function _signTransaction(
		transactionData: Omit<EIP1193TransactionDataOfType2, 'nonce' | 'from'>,
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint}
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
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint}
	): Promise<TransactionInfo> {
		const rawTxInfo = await _signTransaction(transactionData, options);
		const hash = '0xTODO';

		const retries = typeof transactionData.retries === 'undefined' ? 0 : transactionData.retries + 1;

		const timestamp = await time.getTimestamp();

		const newTransactionData: PendingExecutionStored = {
			...rawTxInfo.transactionData,
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
	async function __processPendingTransaction(pendingExecution: PendingExecutionStored): Promise<void> {
		// const receipt = await provider.request({
		// 	method: 'eth_getTransactionReceipt',
		// 	params: [pendingExecution.broadcastedTransaction.hash],
		// });
		const pendingTansaction = await provider.request({
			method: 'eth_getTransactionByHash',
			params: [pendingExecution.hash],
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
			if (pendingExecution.type === '0x2') {
				await _submitTransaction(pendingExecution, {
					forceNonce: parseInt(pendingExecution.nonce.slice(2), 16),
					maxFeePerGas: BigInt(pendingExecution.maxFeePerGas),
					maxPriorityFeePerGas: BigInt(pendingExecution.maxPriorityFeePerGas),
				});
			} else {
			}
		} else if (finalised) {
			storage.deletePendingExecution(pendingExecution);
		}
	}

	async function processPendingTransactions() {
		// TODO test limit, is 10 good enough ? this will depends on exec time and CRON period and number of tx submitted
		const limit = 10;

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

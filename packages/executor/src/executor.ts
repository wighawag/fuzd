import {logs} from 'named-logs';
import ono from '@jsdevtools/ono';
import {
	BroadcasterData,
	EIP1193TransactionDataUsed,
	EIP1193TransactionToFill,
	PendingExecutionStored,
} from './types/executor-storage';
import {EIP1193Account} from 'eip-1193';
import {
	TransactionSubmission,
	Executor,
	ExecutorBackend,
	ExecutorConfig,
	FeePerGasPeriod,
	RawTransactionInfo,
	TransactionInfo,
	TransactionParamsAndSigner,
} from './types/executor';
import {keccak_256} from '@noble/hashes/sha3';

const logger = logs('dreveal-executor');

function toHex(arr: Uint8Array): `0x${string}` {
	let str = `0x`;
	for (const element of arr) {
		str += element.toString(16).padStart(2, '0');
	}
	return str as `0x${string}`;
}
function fromHex(str: `0x${string}`): Uint8Array {
	const matches = str.slice(2).match(/.{1,2}/g);
	if (matches) {
		return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
	}
	return new Uint8Array(0);
}

export function createExecutor(config: ExecutorConfig): Executor & ExecutorBackend {
	const {provider, time, storage, getSignerProviderFor, chainId} = config;
	const finality = config.finality;
	const worstCaseBlockTime = config.worstCaseBlockTime;
	const maxExpiry = config.maxExpiry || 24 * 3600;
	const maxNumTransactionsToProcessInOneGo = config.maxNumTransactionsToProcessInOneGo || 10;
	const chainIdAsHex = `0x${BigInt(chainId).toString(16)}` as const;

	async function submitTransaction(
		id: string,
		account: EIP1193Account,
		submission: TransactionSubmission
	): Promise<TransactionInfo> {
		submission = TransactionSubmission.parse(submission);

		const existingExecution = await storage.getPendingExecution({id});
		if (existingExecution) {
			throw new Error(
				`execution already submitted, the id field is used as identifier. You can reexcute the same tx data but you just need to change the id field.
				This also means if you use different for the same data, that same tx data will be sent as many time as you submit different id
				`
			);
		}

		const currentMaxFee = submission.broadcastSchedule[0];

		// TODO we use global broadcastSchedule using fixed time
		// so if you sent a tx 2 hour ago and the current schedule 2hour later is smaller than
		// the newly submitted tx schedule (for now) then we will resubmit the tx with that new fee schedule

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
		transactionData: EIP1193TransactionToFill & {account: EIP1193Account},
		txParamsAndSigners: TransactionParamsAndSigner,
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; forceVoid?: boolean}
	): Promise<RawTransactionInfo> {
		let actualTransactionData: EIP1193TransactionDataUsed;

		const signer = txParamsAndSigners.signer;
		const from = txParamsAndSigners.broadcasterAddress;

		const expectedNonce = txParamsAndSigners.expectedNonce;
		let nonce = txParamsAndSigners.nonce;
		let nonceIncreased = false;
		if (options.forceNonce) {
			nonce = options.forceNonce;
		} else {
			if (nonce !== expectedNonce) {
				if (nonce > expectedNonce) {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}. this means some tx went through in between`;
					console.error(message);
					nonceIncreased = true;
				} else {
					const message = `nonce not matching, expected ${expectedNonce}, got ${nonce}, this means some tx has not been included yet and we should still keep using the exepected value. We prefer to throw and make the user retry`;
					console.error(message);
					throw new Error(message);
				}
			}
		}

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
						`nonce increased but already resolved. this should never happen since forceNonce should have been used here`
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
						maxFeePerGas: `0x${options.maxFeePerGas.toString(16)}` as `0x${string}`,
						maxPriorityFeePerGas: `0x${options.maxPriorityFeePerGas.toString(16)}` as `0x${string}`,
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
				maxFeePerGas: `0x${options.maxFeePerGas.toString(16)}` as `0x${string}`,
				maxPriorityFeePerGas: `0x${options.maxPriorityFeePerGas.toString(16)}` as `0x${string}`,
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
		transactionData: EIP1193TransactionToFill & {account: EIP1193Account}
	): Promise<TransactionParamsAndSigner> {
		const signer = await getSignerProviderFor(transactionData.account);
		const [broadcasterAddress] = await signer.request({method: 'eth_accounts'});

		const nonceAsHex = await provider.request({
			method: 'eth_getTransactionCount',
			params: [broadcasterAddress, 'latest'],
		});
		const nonce = parseInt(nonceAsHex.slice(2), 16);
		if (isNaN(nonce)) {
			throw new Error(`could not parse transaction count while checking for expected nonce`);
		}
		let broadcasterData: BroadcasterData;
		const dataFromStorage = await storage.getBroadcaster({address: broadcasterAddress});
		if (dataFromStorage) {
			broadcasterData = dataFromStorage;
		} else {
			broadcasterData = {address: broadcasterAddress, nextNonce: nonce};
		}

		const expectedNonce = broadcasterData.nextNonce;

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
			throw ono(err, 'The transaction reverts. Aborting here');
		}

		return {expectedNonce, nonce, broadcasterAddress, signer, gasRequired: BigInt(gasRequired)};
	}

	async function _submitTransaction(
		transactionData: Omit<
			PendingExecutionStored,
			'from' | 'hash' | 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'broadcastTime' | 'nextCheckTime'
		>,
		options: {forceNonce?: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; forceVoid?: boolean}
	): Promise<TransactionInfo> {
		const txParams = await _getTxParams(transactionData);
		const {gasRequired} = txParams;

		if (gasRequired > BigInt(transactionData.gas)) {
			throw new Error(`The transaction requires more gas than provided. Aborting here`);
		}

		const rawTxInfo = await _signTransaction(transactionData, txParams, options);
		const hash = toHex(keccak_256(fromHex(rawTxInfo.rawTx)));

		const retries = typeof transactionData.retries === 'undefined' ? 0 : transactionData.retries + 1;

		const timestamp = await time.getTimestamp();
		const nextCheckTime = timestamp + 60; // TODO config

		const newTransactionData: PendingExecutionStored = {
			...rawTxInfo.transactionData,
			broadcastSchedule: transactionData.broadcastSchedule,
			id: transactionData.id,
			account: transactionData.account,
			hash,
			broadcastTime: timestamp,
			nextCheckTime,
			retries,
		};
		await storage.createOrUpdatePendingExecution(newTransactionData);

		try {
			await provider.request({method: 'eth_sendRawTransaction', params: [rawTxInfo.rawTx]});
		} catch (err) {
			console.error(`The broadcast failed, we attempts one more time`, err);
			try {
				await provider.request({method: 'eth_sendRawTransaction', params: [rawTxInfo.rawTx]});
			} catch (err) {
				console.error(
					`The broadcast failed again but we ignore it as we are going to handle it when processing recorded transactions.`,
					err
				);
			}
		}

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

import {BroadcasterSignerData, ChainProtocol, GasEstimate, Transaction, TransactionStatus} from '..';
import type {Methods} from '@starknet-io/types-js';
import type {CurriedRPC, RequestRPC} from 'remote-procedure-call';
import {createCurriedJSONRPC} from 'remote-procedure-call';
import {ExecutionSubmission} from 'fuzd-common';
import type {INVOKE_TXN_V1} from 'strk/types/rpc/components';

import {initAccountFromHD} from 'remote-account';

type TransactionData = INVOKE_TXN_V1;

export class StarknetChainProtocol implements ChainProtocol {
	private rpc: CurriedRPC<Methods>;
	constructor(
		public readonly url: string | RequestRPC<Methods>,
		public readonly config: {
			expectedFinality: number;
			worstCaseBlockTime: number;
			contractTimestamp?: `0x${string}`;
		},
		public account: ReturnType<typeof initAccountFromHD>, // TODO remote-account : export this type
	) {
		this.rpc = createCurriedJSONRPC<Methods>(url);
	}

	async getTransactionStatus(transaction: Transaction, finality: number): Promise<TransactionStatus> {
		let finalised = false;
		let blockTime: number | undefined;
		const receiptResponse = await this.rpc.call('starknet_getTransactionReceipt')({transaction_hash: transaction.hash});

		const receipt = receiptResponse.success && receiptResponse.value.block_hash ? receiptResponse.value : undefined;
		if (receipt) {
			const latestBlocknumberResponse = await this.rpc.call('starknet_blockNumber')();
			if (!latestBlocknumberResponse.success) {
				throw new Error(`Failed to get latest block number`, {cause: latestBlocknumberResponse.error});
			}
			const latestBlockNumber = Number(latestBlocknumberResponse.value);
			const receiptBlocknumber = Number(receipt.block_number);

			if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
				throw new Error(
					`could not parse blocknumbers, latest: ${latestBlocknumberResponse.value}, receipt: ${receipt.block_number}`,
				);
			}

			const blockResponse = await this.rpc.call('starknet_getBlockWithTxHashes')({
				block_id: {
					block_hash: receipt.block_hash,
				},
			});
			if (blockResponse.success) {
				blockTime = Number(blockResponse.value.timestamp);
				finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - finality);
			}
		}

		let failed: boolean | undefined;
		if (receipt) {
			if (receipt.execution_status === 'REVERTED') {
				failed = true;
			} else if (receipt.execution_status === 'SUCCEEDED') {
				failed = false;
			} else {
				throw new Error(
					`Could not get the tx status for ${(receipt as any).transaction_hash} (status: ${(receipt as any).execution_status})`,
				);
			}
		}

		if (finalised) {
			return {
				finalised,
				blockTime: blockTime as number,
				failed: failed as boolean,
			};
		} else {
			return {
				finalised,
				blockTime,
				failed,
				pending: receipt ? true : false,
			};
		}
	}

	async isTransactionFinalised(
		txHash: `0x${string}`,
	): Promise<{finalised: true} | {finalised: false; pending: boolean}> {
		const receiptResponse = await this.rpc.call('starknet_getTransactionReceipt')({transaction_hash: txHash});

		const receipt = receiptResponse.success && receiptResponse.value.block_hash ? receiptResponse.value : undefined;

		let finalised = false;
		if (receipt) {
			const latestBlocknumberResponse = await this.rpc.call('starknet_blockNumber')();
			if (!latestBlocknumberResponse.success) {
				throw new Error(`Failed to get latest block number`, {cause: latestBlocknumberResponse.error});
			}

			const latestBlockNumber = Number(latestBlocknumberResponse.value);
			const receiptBlocknumber = Number(receipt.block_number);

			if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
				throw new Error(
					`could not parse blocknumbers, latest: ${latestBlocknumberResponse.value}, receipt: ${receipt.block_number}`,
				);
			}
			finalised = latestBlockNumber - this.config.expectedFinality >= receiptBlocknumber;
		}

		if (finalised) {
			return {finalised};
		} else {
			return {finalised, pending: receipt ? true : false};
		}
	}

	async isTransactionPending(txHash: `0x${string}`): Promise<boolean> {
		const txStatusResponse = await this.rpc.call('starknet_getTransactionStatus')({transaction_hash: txHash});

		// if (!txStatusResponse.success) {
		//     if (txStatusResponse.error.code !== 29) {
		//         throw new Error(`could not fetch tx`);
		//     }
		// }
		const pendingTansaction = txStatusResponse.success ? txStatusResponse.value : null;

		return pendingTansaction ? true : false;
	}

	async getBalance(account: `0x${string}`): Promise<bigint> {
		const balanceResponse = await this.rpc.call('starknet_call')({
			block_id: 'latest',
			request: {
				// TODO
				calldata: [],
				contract_address: '0x',
				entry_point_selector: '',
			},
		});
		if (!balanceResponse.success) {
			throw new Error(`failed to fetch balance`, {cause: balanceResponse.error});
		}
		return BigInt(balanceResponse.value[0]);
	}

	async broadcastSignedTransaction(tx: any): Promise<`0x${string}`> {
		const invokeResponse = await this.rpc.call('starknet_addInvokeTransaction')({invoke_transaction: tx});
		if (!invokeResponse.success) {
			throw new Error(`could not send response`, {cause: invokeResponse.error});
		}
		return invokeResponse.value.transaction_hash as `0x${string}`; // TODO string ?
	}

	async getNonce(account: `0x${string}`): Promise<`0x${string}`> {
		const nonceReponse = await this.rpc.call('starknet_getNonce')({
			block_id: 'latest',
			contract_address: account,
		});
		if (!nonceReponse.success) {
			throw new Error(`failed to fetch balance`, {cause: nonceReponse.error});
		}
		return nonceReponse.value as `0x${string}`;
	}

	async estimateGasNeeded(tx: any): Promise<bigint> {
		const gasResponse = await this.rpc.call('starknet_estimateFee')({
			block_id: 'latest',
			request: [tx],
			simulation_flags: [],
			// TODO signature
		});
		if (!gasResponse.success) {
			throw new Error(`could not estimateFee`);
		}
		const gasEstimate = gasResponse.value[0];
		const {data_gas_consumed, data_gas_price, gas_consumed, gas_price, overall_fee, unit} = gasEstimate;
		return BigInt(gas_consumed) + BigInt(data_gas_consumed); // TODO check
	}

	async getGasFee(executionData: {maxFeePerGasAuthorized: `0x${string}`}): Promise<GasEstimate> {
		// const gasResponse = await this.rpc.call('starknet_estimateFee')({
		// 	block_id: 'latest',
		// 	request: [
		// 		{
		// 			// TODO dummy
		// 			type: 'INVOKE',
		// 			version: '0x1',
		// 			calldata: [],
		// 			max_fee: '0xFFFFFFFFFFFFFFFF',
		// 			sender_address: '0x',
		// 			nonce: '0x1',
		// 			signature: [],
		// 		},
		// 	],
		// 	simulation_flags: ['SKIP_VALIDATE'], // We skip validate as we do not care of the actual gas consumed, just the price
		// });
		// if (!gasResponse.success) {
		// 	throw new Error(`could not fetch gas`);
		// }
		// const gasEstimate = gasResponse.value[0];
		// const {data_gas_consumed, data_gas_price, gas_consumed, gas_price, overall_fee, unit} = gasEstimate;

		const blockResponse = await this.rpc.call('starknet_getBlockWithTxHashes')({block_id: 'latest'});
		if (!blockResponse.success) {
			throw new Error(`could not fetch block`, {cause: blockResponse.error});
		}

		const gas_l1_price = blockResponse.value.l1_gas_price.price_in_wei;
		const gas_l1_data_price = blockResponse.value.l1_data_gas_price.price_in_wei;

		// return {maxFeePerGas, maxPriorityFeePerGas, gasPriceEstimate};

		return {
			maxFeePerGas: BigInt(gas_l1_price),
			maxPriorityFeePerGas: 0n,
			gasPriceEstimate: {
				maxFeePerGas: BigInt(gas_l1_price),
				maxPriorityFeePerGas: 0n,
			},
		};
	}

	parseExecutionSubmission<TransactionDataType>(
		execution: ExecutionSubmission<TransactionDataType>,
	): ExecutionSubmission<TransactionDataType> {
		// return GenericSchemaExecutionSubmission(SchemaTransactionData).parse(
		// 	execution,
		// ) as ExecutionSubmission<TransactionDataType>;

		// TODO
		return execution;
	}

	async assignProviderFor(chainId: `0x${string}`, forAddress: `0x${string}`): Promise<BroadcasterSignerData> {
		const derivedAccount = this.account.deriveForAddress(forAddress);
		return {
			assignerID: this.account.publicExtendedKey,
			signer: `privateKey:${derivedAccount.privateKey}`,
			address: derivedAccount.address, // TODO contract_address
		};
	}
	async getProviderByAssignerID(assignerID: string, forAddress: `0x${string}`): Promise<BroadcasterSignerData> {
		const derivedAccount = this.account.deriveForAddress(forAddress);
		// TODO get it from assignerID
		return {
			signer: `privateKey:${derivedAccount.privateKey}`,
			assignerID,
			address: derivedAccount.address, // TODO contract_address
		};
	}

	async checkValidity<TransactionDataType>(
		broadcasterAddress: `0x${string}`,
		data: Partial<TransactionDataType>,
	): Promise<{revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean}> {
		// return {notEnoughGas: gasRequired > BigInt(transactionData.gas) ? true : false, revert: false};
	}

	async signTransaction<TransactionDataType>(
		chainId: `0x${string}`,
		data: Partial<TransactionDataType>,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
		options: {
			forceVoid?: boolean;
			nonceIncreased: boolean;
		},
	): Promise<{
		rawTx: any;
		hash: `0x${string}`;
		transactionData: TransactionDataType;
		isVoidTransaction: boolean;
	}> {}

	generatePaymentTransaction<TransactionDataType>(
		data: TransactionDataType,
		maxFeePerGas: bigint,
		from: `0x${string}`,
		diffToCover: bigint,
	): {transaction: TransactionDataType; cost: bigint} {
		// TODO ERC20  contract...
		// return {transaction: transactionToBroadcast, cost};
	}

	// TODO FOR TEST ONLY
	offset = 0;
	async getTimestamp(): Promise<number> {
		// TODO support Time contracts
		// if (this.config.contractTimestamp) {
		// 	const result = await this.rpc.request({
		// 		method: 'eth_call',
		// 		params: [
		// 			{
		// 				to: this.config.contractTimestamp,
		// 				data: '0xb80777ea', // timestamp()
		// 			},
		// 		],
		// 	});
		// 	const value = Number(result);
		// 	return value;
		// }

		const blockResponse = await this.rpc.call('starknet_getBlockWithTxHashes')({block_id: 'latest'});
		if (!blockResponse.success) {
			throw new Error(`could not fetch block`, {cause: blockResponse.error});
		}
		return Number(blockResponse.value.timestamp) + this.offset;
	}
	async increaseTime(amount: number): Promise<void> {
		this.offset += amount;
	}
}

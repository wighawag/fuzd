import {BroadcasterSignerData, ChainProtocol, GasEstimate, Transaction, TransactionStatus} from '..';
import type {Methods} from '@starknet-io/types-js';
import type {CurriedRPC, RequestRPC} from 'remote-procedure-call';
import {createCurriedJSONRPC} from 'remote-procedure-call';
import {ExecutionSubmission, TransactionParametersUsed} from 'fuzd-common';
import type {
	DEPLOY_ACCOUNT_TXN_V1,
	DEPLOY_ACCOUNT_TXN_V3,
	INVOKE_TXN_V1,
	INVOKE_TXN_V3,
	TXN,
} from 'strk/types/rpc/components';

import {initAccountFromHD} from 'remote-account';

import ERC20ABI from './abis/ERC20';
import {create_call, create_deploy_account_transaction_intent_v1, create_invoke_transaction_intent_v1} from 'strk';
import {BigNumberish, Call, CallData, hash} from 'starknet-core';
import {getStarkKey, sign} from '@scure/starknet';
import {formatSignature} from 'starknet-core/utils/stark';
import type {DeepReadonly} from 'strk';
import {getExecuteCalldata} from 'starknet-core/utils/transaction';

type FullTransactionData = TXN;

type OmitSignedTransactionData<T> = Omit<T, 'sender_address' | 'signature' | 'chain_id' | 'nonce'>;

type InvokeTransactionData =
	| OmitSignedTransactionData<DeepReadonly<INVOKE_TXN_V1>>
	| (Omit<OmitSignedTransactionData<DeepReadonly<INVOKE_TXN_V3>>, 'resource_bounds' | 'tip'> & {
			resource_bounds: {
				l1_gas: {
					max_amount: string;
				};
				l2_gas: {
					max_amount: string;
				};
			};
	  });

// TODO should not be accepted unless for preliminary
type DeployAccountTransactionData =
	| OmitSignedTransactionData<DeepReadonly<DEPLOY_ACCOUNT_TXN_V1>>
	| (Omit<OmitSignedTransactionData<DeepReadonly<DEPLOY_ACCOUNT_TXN_V3>>, 'resource_bounds' | 'tip'> & {
			resource_bounds: {
				l1_gas: {
					max_amount: string;
				};
				l2_gas: {
					max_amount: string;
				};
			};
	  });

export type AllowedTransactionData = InvokeTransactionData;
type TransactionData = InvokeTransactionData | DeployAccountTransactionData;
type FullTransactionDataWithoutSignature = Omit<FullTransactionData, 'signature'>; // TODO do not accept deploy_account tx ?

export class StarknetChainProtocol implements ChainProtocol {
	private rpc: CurriedRPC<Methods>;
	constructor(
		public readonly url: string | RequestRPC<Methods>,
		public readonly config: {
			expectedFinality: number;
			worstCaseBlockTime: number;
			contractTimestamp?: `0x${string}`;
			tokenContractAddress: `0x${string}`;
			accountContractClassHash: `0x${string}`; // should not be changed unless we handle broadcaster data
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
		// const contractCallData: CallData = new CallData(contract.sierra.abi);
		// const contractConstructor: Calldata = contractCallData.compile('constructor', {
		// 	public_key: publicKey0,
		// });

		const balanceResponse = await this.rpc.call('starknet_call')(
			create_call({
				block_id: 'latest',
				contract_address: this.config.tokenContractAddress,
				calldata: [account],
				entry_point: 'balanceOf',
			}),
		);
		if (!balanceResponse.success) {
			throw new Error(`failed to fetch balance`, {cause: balanceResponse.error});
		}
		return BigInt(balanceResponse.value[0]);
	}

	async broadcastSignedTransaction(tx: any): Promise<`0x${string}`> {
		const transaction = tx as FullTransactionData;
		if (transaction.type === 'INVOKE') {
			const invokeResponse = await this.rpc.call('starknet_addInvokeTransaction')({invoke_transaction: transaction});
			if (!invokeResponse.success) {
				throw new Error(`could not send response`, {cause: invokeResponse.error});
			}
			return invokeResponse.value.transaction_hash as `0x${string}`; // TODO string ?
		} else if (transaction.type === 'DEPLOY_ACCOUNT') {
			const invokeResponse = await this.rpc.call('starknet_addDeployAccountTransaction')({
				deploy_account_transaction: transaction,
			});
			if (!invokeResponse.success) {
				throw new Error(`could not send response`, {cause: invokeResponse.error});
			}
			return invokeResponse.value.transaction_hash as `0x${string}`; // TODO string ?
		} else {
			throw new Error(`transaction type not supported: ${transaction.type}`);
		}
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
		const serverAccount = this.account; // TODO save in assignmentID: initAccountFromHD(this.hdkey);
		const derivedAccount = serverAccount.deriveForAddress(forAddress);
		const publicKey = getStarkKey(derivedAccount.privateKey);
		const accountContractAddress = hash.calculateContractAddressFromHash(
			publicKey,
			this.config.accountContractClassHash,
			[publicKey],
			0,
		) as `0x${string}`;
		return {
			assignerID: `${serverAccount.publicExtendedKey}:${this.config.accountContractClassHash}`,
			signer: `privateKey:${derivedAccount.privateKey}`,
			address: accountContractAddress,
		};
	}
	async getProviderByAssignerID(assignerID: string, forAddress: `0x${string}`): Promise<BroadcasterSignerData> {
		const [serverPublicKey, accountContractClassHash] = assignerID.split(':');
		const serverAccount = this.account; // TODO get from assignmentID: initAccountFromHD(this.hdkey);
		const derivedAccount = serverAccount.deriveForAddress(forAddress);
		const publicKey = getStarkKey(derivedAccount.privateKey);
		const accountContractAddress = hash.calculateContractAddressFromHash(
			publicKey,
			accountContractClassHash,
			[publicKey],
			0,
		) as `0x${string}`;

		return {
			signer: `privateKey:${derivedAccount.privateKey}`,
			assignerID,
			address: accountContractAddress,
		};
	}

	async checkValidity<TransactionDataType>(
		chainId: `0x${string}`,
		data: TransactionDataType,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<{revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean}> {
		// TODO
		// return {notEnoughGas: gasRequired > BigInt(transactionData.gas) ? true : false, revert: false};
		return {
			notEnoughGas: false,
			revert: false,
		};
	}

	async signTransaction<TransactionDataType>(
		chainId: `0x${string}`,
		data: TransactionDataType,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<{
		rawTx: any;
		hash: `0x${string}`;
		transactionData: TransactionDataType;
		isVoidTransaction: boolean;
	}> {
		const [protocol, protocolData] = broadcaster.signer.split(':');
		let privateKey: `0x${string}`;
		if (protocol === 'privateKey') {
			privateKey = protocolData as `0x${string}`;
		} else {
			throw new Error(`protocol ${protocol} not supported`);
		}

		let transactionData = data as TransactionData;

		let hash: `0x${string}`;
		let signature: BigNumberish[];
		if (transactionData.type === 'INVOKE') {
			const intent = create_invoke_transaction_intent_v1({
				...transactionData,
				chain_id: chainId,
				nonce: transactionParameters.nonce,
				sender_address: broadcaster.address,
				max_fee: 1,
			});
			hash = intent.hash as `0x${string}`;
			signature = formatSignature(sign(intent.hash, privateKey));
		} else {
			throw new Error(`type ${transactionData.type} not supported yet`);
		}

		const actualTransactionData: FullTransactionDataWithoutSignature = {
			...transactionData,
		};

		const rawTx = {
			...data,
			signature,
		};

		return {
			rawTx,
			hash,
			transactionData: actualTransactionData as TransactionDataType,
			isVoidTransaction: false,
		};
	}

	// async signVoidTransaction<TransactionDataType>(
	// 	chainId: `0x${string}`,
	// 	broadcaster: BroadcasterSignerData,
	// 	transactionParameters: TransactionParametersUsed,
	// ): Promise<{
	// 	rawTx: any;
	// 	hash: `0x${string}`;
	// 	transactionData: TransactionDataType;
	// 	isVoidTransaction: boolean;
	// }> {

	// }

	requiredPreliminaryTransaction<TransactionDataType>(
		chainId: string,
		broadcaster: BroadcasterSignerData,
		account: `0x${string}`,
	): TransactionDataType {
		const [serverPublicKey, accountContractClassHash] = broadcaster.assignerID.split(':');
		const serverAccount = this.account; // TODO get from assignmentID: initAccountFromHD(this.hdkey);
		const derivedAccount = serverAccount.deriveForAddress(account);
		const publicKey = getStarkKey(derivedAccount.privateKey);

		const {data} = create_deploy_account_transaction_intent_v1({
			chain_id: chainId,
			class_hash: this.config.accountContractClassHash,
			constructor_calldata: [publicKey],
			contract_address_salt: 0,
			max_fee: 0, // TODO
			nonce: 0,
		});

		const tx: TransactionData = data;

		return tx as TransactionDataType;
	}

	generatePaymentTransaction<TransactionDataType>(
		data: TransactionDataType,
		maxFeePerGas: bigint,
		from: `0x${string}`,
		diffToCover: bigint,
	): {transaction: TransactionDataType; cost: bigint} {
		const transactionData = data as TransactionData;
		const gas = BigInt(30000);
		const cost = gas * maxFeePerGas; // TODO handle extra Fee like Optimism

		// TODO support v3
		if (transactionData.version !== '0x1') {
			throw new Error(`only support v1 transaction`);
		}
		const valueToSend = diffToCover * BigInt(transactionData.max_fee); // TODO or v3 resource_bounds

		const calldataParser = new CallData(ERC20ABI);
		const transferCalldata = calldataParser.compile('transfer', [from, valueToSend]);
		const actualCall: Call = {
			contractAddress: this.config.tokenContractAddress,
			entrypoint: 'transfer',
			calldata: transferCalldata,
		};

		const calldata = getExecuteCalldata([actualCall], '1');

		const transactionToBroadcast: TransactionData = {
			type: 'INVOKE',
			calldata,
			version: '0x1',
			max_fee: `0x${gas.toString(16)}`,
		};
		return {transaction: transactionToBroadcast as TransactionDataType, cost};
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

	// ---------------------------------------------
	// INTERNAL
	// ---------------------------------------------

	async _estimateGasNeeded(tx: any): Promise<bigint> {
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
}

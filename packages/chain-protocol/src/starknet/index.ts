import {BroadcasterSignerData, ChainProtocol, GasEstimate, Transaction, TransactionStatus} from '..';
import type {Methods} from '@starknet-io/types-js';
import type {CurriedRPC, RequestRPC} from 'remote-procedure-call';
import {createCurriedJSONRPC} from 'remote-procedure-call';
import {DerivationParameters, ExecutionSubmission, TransactionParametersUsed} from 'fuzd-common';
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
import {ethSigToPrivate, getStarkKey, sign} from '@scure/starknet';
import {formatSignature} from 'starknet-core/utils/stark';
import type {DeepReadonly} from 'strk';
import {getExecuteCalldata} from 'starknet-core/utils/transaction';
import {EIP1193LocalSigner} from 'eip-1193-signer';

type FullTransactionData = TXN;

type OmitSignedTransactionData<T> = Omit<T, 'sender_address' | 'signature' | 'nonce'>;

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
				throw new Error(
					`starknet_addInvokeTransaction: ${invokeResponse.error.message} (${invokeResponse.error.code}) ${'data' in invokeResponse.error && invokeResponse.error.data ? JSON.stringify(invokeResponse.error.data) : ''}`,
					{cause: invokeResponse.error},
				);
			}
			return invokeResponse.value.transaction_hash as `0x${string}`; // TODO string ?
		} else if (transaction.type === 'DEPLOY_ACCOUNT') {
			const deployAccountResponse = await this.rpc.call('starknet_addDeployAccountTransaction')({
				deploy_account_transaction: transaction,
			});
			if (!deployAccountResponse.success) {
				throw new Error(
					`starknet_addDeployAccountTransaction: ${deployAccountResponse.error.message} (${deployAccountResponse.error.code}) ${'data' in deployAccountResponse.error && deployAccountResponse.error.data ? JSON.stringify(deployAccountResponse.error.data) : ''}`,
					{cause: deployAccountResponse.error},
				);
			}
			return deployAccountResponse.value.transaction_hash as `0x${string}`; // TODO string ?
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
			if (nonceReponse.error.code == 20) {
				return `0x0`;
			}
			throw new Error(nonceReponse.error.message, {cause: nonceReponse.error});
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
			throw new Error(`could not fetch block: ${blockResponse.error.message} (${blockResponse.error.code})`, {
				cause: blockResponse.error,
			});
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

	async validateDerivationParameters(
		parameters: DerivationParameters,
	): Promise<{success: true} | {success: false; error: string}> {
		if (parameters.type !== 'starknet') {
			return {success: false, error: `invalid type: ${parameters.type}`};
		}
		if (typeof parameters.data !== 'object') {
			return {
				success: false,
				error: `data must be an object containing the server public key and the account class hash`,
			};
		}

		if (typeof parameters.data.publicKey !== 'string') {
			return {
				success: false,
				error: `data.publicKey is invalid`,
			};
		}

		if (typeof parameters.data.accountClassHash !== 'string') {
			return {
				success: false,
				error: `data.accountClassHash is invalid`,
			};
		}

		return {success: true};
	}
	async getCurrentDerivationParameters(): Promise<DerivationParameters> {
		return {
			type: 'starknet',
			data: {
				publicKey: this.account.publicExtendedKey,
				accountClassHash: this.config.accountContractClassHash,
			},
		};
	}
	async getBroadcaster(parameters: DerivationParameters, forAddress: `0x${string}`): Promise<BroadcasterSignerData> {
		const validation = await this.validateDerivationParameters(parameters);

		// TODO allow multiple by mapping publicExtendedKey to accounts
		// FOR NOW: throw if different:
		if (!validation.success) {
			throw new Error(validation.error);
		}
		const {public_key, private_key} = await this._getStarknetSigner(this.account, forAddress);
		const accountContractAddress = hash.calculateContractAddressFromHash(
			public_key,
			this.config.accountContractClassHash,
			[public_key],
			0,
		) as `0x${string}`;
		return {
			signer: `privateKey:${private_key}`,
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
			if (transactionData.version === '0x1') {
				const intent = create_invoke_transaction_intent_v1({
					...transactionData,
					chain_id: chainId,
					nonce: transactionParameters.nonce,
					sender_address: broadcaster.address,
				});
				hash = intent.hash as `0x${string}`;
				signature = formatSignature(sign(intent.hash, privateKey));

				const rawTx = {
					...intent.data,
					signature,
				};

				return {
					rawTx,
					hash,
				};
			} else {
				throw new Error(`invoke version: ${transactionData.version} not supported`);
			}
		} else if (transactionData.type === 'DEPLOY_ACCOUNT') {
			if (transactionData.version === '0x1') {
				const intent = create_deploy_account_transaction_intent_v1({
					...transactionData,
					chain_id: chainId,
					nonce: transactionParameters.nonce,
				});
				hash = intent.hash as `0x${string}`;
				signature = formatSignature(sign(intent.hash, privateKey));

				const rawTx = {
					...intent.data,
					signature,
				};

				console.log(`DEPLOY_ACCOUNT`, rawTx);

				return {
					rawTx,
					hash,
				};
			} else {
				throw new Error(`deploy_account version: ${transactionData.version} not supported`);
			}
		} else {
			throw new Error(`type ${(transactionData as any).type} not supported yet`);
		}
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
		const [protocol, protocolData] = broadcaster.signer.split(':');
		let privateKey: `0x${string}`;
		if (protocol === 'privateKey') {
			privateKey = protocolData as `0x${string}`;
		} else {
			throw new Error(`protocol ${protocol} not supported`);
		}
		const publicKey = getStarkKey(privateKey);

		const {data} = create_deploy_account_transaction_intent_v1({
			chain_id: chainId,
			class_hash: this.config.accountContractClassHash,
			constructor_calldata: [publicKey],
			contract_address_salt: publicKey,
			max_fee: '0xFFFFFFFFFFFFFFF', // TODO
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

	// TODO remote-account : export this type: ReturnType<typeof initAccountFromHD>
	async _getStarknetSigner(
		account: ReturnType<typeof initAccountFromHD>,
		forAddress: `0x${string}`,
	): Promise<{public_key: string; private_key: string}> {
		const derivedAccount = account.deriveForAddress(forAddress);

		const ethSigner = new EIP1193LocalSigner(derivedAccount.privateKey);
		const signature = await ethSigner.request({
			method: 'personal_sign',
			params: ['0xFF', derivedAccount.address],
		});
		const starkPrivateKey = ethSigToPrivate(signature);
		const publicKey = getStarkKey(starkPrivateKey);

		return {
			private_key: starkPrivateKey,
			public_key: publicKey,
		};
	}

	// // TODO remote-account : export this type: ReturnType<typeof initAccountFromHD>
	// async _getStarkKeyFromETHAccount(ethereumSigner: {privateKey: `0x${string}`, address: `0x${string}`}): Promise<string> {
	// 	const eip1193Signer = new EIP1193LocalSigner(ethereumSigner.privateKey);
	// 	const signature = await eip1193Signer.request({
	// 		method: 'personal_sign',
	// 		params: ['0xFF', ethereumSigner.address],
	// 	});
	// 	const starkPrivateKey = ethSigToPrivate(signature);
	// 	const publicKey = getStarkKey(starkPrivateKey);

	// 	return {
	// 		private_key: derivedAccount.privateKey,
	// 		public_key: publicKey,
	// 	};
	// }
}

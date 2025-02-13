import {BroadcasterSignerData, ChainProtocol, GasEstimate, Transaction, TransactionStatus} from '../index.js';
import type {Methods} from '@starknet-io/types-js';
import type {CurriedRPC, RequestRPC} from 'remote-procedure-call';
import {createCurriedJSONRPC, type RPCErrors} from 'remote-procedure-call';
import {DerivationParameters, IntegerString, String0x, TransactionParametersUsed} from 'fuzd-common';
import type {
	DEPLOY_ACCOUNT_TXN_V1,
	DEPLOY_ACCOUNT_TXN_V3,
	INVOKE_TXN_V1,
	INVOKE_TXN_V3,
} from 'strk/types/rpc/components';

import {initAccountFromHD, type ETHAccount} from 'remote-account';

import ERC20ABI from './abis/ERC20.js';
import {create_call, create_deploy_account_transaction_intent_v1, create_invoke_transaction_intent_v1} from 'strk';
import {Call, CallData, hash} from 'starknet-core';
import {ethSigToPrivate, getStarkKey, sign} from '@scure/starknet';
import {formatSignature} from 'starknet-core/utils/stark';
import type {DeepReadonly} from 'strk';
import {getExecuteCalldata} from 'starknet-core/utils/transaction';
import {EIP1193LocalSigner} from 'eip-1193-signer';

// TODO Fix readonly in @starknet-io/types-js
type FullStarknetTransactionData =
	| DeepReadonly<INVOKE_TXN_V1>
	| DeepReadonly<INVOKE_TXN_V3>
	| DeepReadonly<DEPLOY_ACCOUNT_TXN_V1>
	| DeepReadonly<DEPLOY_ACCOUNT_TXN_V3>;

type OmitSignedTransactionData<T> = Omit<T, 'sender_address' | 'signature' | 'nonce'>;

type InvokeTransactionDataV1 = {
	type: 'INVOKE';
	sender_address: String0x;
	readonly calldata: String0x[];
	max_fee: String0x;
	version: '0x1';
	readonly signature: String0x[];
	nonce: String0x;
};

type DeployAccountTransactionDataV1 = {
	type: 'DEPLOY_ACCOUNT';
	max_fee: String0x;
	version: '0x1';
	readonly signature: String0x[];
	nonce: String0x;
	contract_address_salt: String0x;
	readonly constructor_calldata: String0x[];
	class_hash: String0x;
};

export type InvokeTransactionData = OmitSignedTransactionData<InvokeTransactionDataV1>;
// TODO
// | (Omit<OmitSignedTransactionData<DeepReadonly<INVOKE_TXN_V3>>, 'resource_bounds' | 'tip'> & {
// 		resource_bounds: {
// 			l1_gas: {
// 				max_amount: string;
// 			};
// 			l2_gas: {
// 				max_amount: string;
// 			};
// 		};
//   });

// TODO should not be accepted unless for preliminary
export type DeployAccountTransactionData = OmitSignedTransactionData<DeployAccountTransactionDataV1>;
// TODO
// | (Omit<OmitSignedTransactionData<DeepReadonly<DEPLOY_ACCOUNT_TXN_V3>>, 'resource_bounds' | 'tip'> & {
// 		resource_bounds: {
// 			l1_gas: {
// 				max_amount: string;
// 			};
// 			l2_gas: {
// 				max_amount: string;
// 			};
// 		};
//   });

export type AllowedTransactionData = InvokeTransactionData;
export type StarknetTransactionData = InvokeTransactionData | DeployAccountTransactionData;

type AllMethods = Methods;
type MethodsErrors = {
	[K in keyof AllMethods]: AllMethods[K] extends {errors: infer E} ? E : never;
}[keyof AllMethods];
function createError(name: string, error: MethodsErrors | RPCErrors) {
	return new Error(
		`${name}: ${error.message} (${error.code}) ${'data' in error && error.data ? JSON.stringify(error.data) : ''}`,
		{cause: error},
	);
}

export class StarknetChainProtocol implements ChainProtocol<StarknetTransactionData> {
	private rpc: CurriedRPC<Methods>;
	constructor(
		public readonly url: string | RequestRPC<Methods>,
		public readonly config: {
			expectedFinality: number;
			worstCaseBlockTime: number;
			contractTimestamp?: String0x;
			tokenContractAddress: String0x;
			accountContractClassHash: String0x;
		},
	) {
		this.rpc = createCurriedJSONRPC<Methods>(url);
	}

	async getTransactionStatus(transaction: Transaction): Promise<TransactionStatus> {
		let finalised = false;
		let blockTime: number | undefined;
		const receiptResponse = await this.rpc.call('starknet_getTransactionReceipt')({transaction_hash: transaction.hash});

		if (!receiptResponse.success) {
			if (receiptResponse.error.code == 29) {
				// TX_HASH_NOT_FOUND
			} else {
				return {
					success: false,
					error: receiptResponse.error,
				};
			}
		}

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
				finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - this.config.expectedFinality);
			}
		}

		let status: 'failed' | 'success' | undefined; // TODO: | 'replaced' | 'unknown' | undefined;
		if (receipt) {
			if (receipt.execution_status === 'REVERTED') {
				status = 'failed';
			} else if (receipt.execution_status === 'SUCCEEDED') {
				status = 'success';
			} else {
				throw new Error(
					`Could not get the tx status for ${(receipt as any).transaction_hash} (status: ${(receipt as any).execution_status})`,
				);
			}
		}

		if (finalised && receipt) {
			return {
				success: true,
				finalised: true,
				blockTime: blockTime as number,
				status: status!,
				cost: BigInt(receipt.actual_fee.amount), // TODO unit
			};
		} else {
			return {
				success: true,
				finalised: false,
				blockTime,
				status,
				pending: receipt ? true : false,
			};
		}
	}

	async isTransactionPending(txHash: String0x): Promise<boolean> {
		const txStatusResponse = await this.rpc.call('starknet_getTransactionStatus')({transaction_hash: txHash});

		// if (!txStatusResponse.success) {
		//     if (txStatusResponse.error.code !== 29) {
		//         throw new Error(`could not fetch tx`);
		//     }
		// }
		const pendingTansaction = txStatusResponse.success ? txStatusResponse.value : null;

		return pendingTansaction ? true : false;
	}

	async getBalance(account: String0x): Promise<bigint> {
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

	async broadcastSignedTransaction(tx: any): Promise<String0x> {
		const transaction = tx as FullStarknetTransactionData;
		if (transaction.type === 'INVOKE') {
			const invokeResponse = await this.rpc.call('starknet_addInvokeTransaction')({invoke_transaction: transaction});
			if (!invokeResponse.success) {
				throw createError(`starknet_addInvokeTransaction`, invokeResponse.error);
			}
			return invokeResponse.value.transaction_hash as String0x; // TODO string ?
		} else if (transaction.type === 'DEPLOY_ACCOUNT') {
			const deployAccountResponse = await this.rpc.call('starknet_addDeployAccountTransaction')({
				deploy_account_transaction: transaction,
			});
			if (!deployAccountResponse.success) {
				throw createError(`starknet_addDeployAccountTransaction`, deployAccountResponse.error);
			}
			return deployAccountResponse.value.transaction_hash as String0x; // TODO string ?
		} else {
			throw new Error(`transaction type not supported: ${(transaction as any).type}`);
		}
	}

	async getNonce(account: String0x): Promise<String0x> {
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
		return nonceReponse.value as String0x;
	}

	async getGasFee(executionData: {maxFeePerGasAuthorized: String0x}, importanceRatio: number): Promise<GasEstimate> {
		const blockResponse = await this.rpc.call('starknet_getBlockWithTxHashes')({block_id: 'latest'});
		if (!blockResponse.success) {
			throw new Error(`could not fetch block: ${blockResponse.error.message} (${blockResponse.error.code})`, {
				cause: blockResponse.error,
			});
		}

		// TODO use importanceRatio
		const gas_l1_price = blockResponse.value.l1_gas_price.price_in_wei;
		// TODO
		const gas_l1_data_price = blockResponse.value.l1_data_gas_price.price_in_wei;

		return {
			maxFeePerGas: BigInt(gas_l1_price),
			maxPriorityFeePerGas: 0n, // TODO ?
			gasPriceEstimate: {
				maxFeePerGas: BigInt(gas_l1_price),
				maxPriorityFeePerGas: 0n, // TODO ?
			},
		};
	}

	async validateDerivationParameters(
		parameters: DerivationParameters,
	): Promise<{success: true} | {success: false; error: string}> {
		const validation = await this._validateDerivationParameters(parameters);
		if (!validation.success) {
			return validation;
		}

		return {success: true};
	}

	async getDerivationParameters(account: ETHAccount): Promise<DerivationParameters> {
		return {
			type: 'starknet',
			data: {
				publicKey: account.publicExtendedKey,
				accountClassHash: this.config.accountContractClassHash,
			},
		};
	}
	async getBroadcaster(
		account: ETHAccount,
		parameters: DerivationParameters,
		forAddress: String0x,
	): Promise<BroadcasterSignerData> {
		const validation = await this.validateDerivationParameters(parameters);
		if (!validation.success) {
			throw new Error(validation.error);
		}

		const {public_key, private_key} = await this._getStarknetSigner(account, forAddress);
		const accountContractAddress = hash.calculateContractAddressFromHash(
			public_key,
			this.config.accountContractClassHash,
			[public_key],
			0,
		) as String0x;
		return {
			signer: `privateKey:${private_key}`,
			address: accountContractAddress,
		};
	}

	async checkValidity(
		chainId: IntegerString,
		transactionData: StarknetTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<{revert: 'unknown'} | {revert: boolean; notEnoughGas: boolean}> {
		const {rawTx, hash} = this._createFullTransaction(chainId, transactionData, broadcaster, transactionParameters);

		let gasRequired: bigint;
		try {
			const gasResponse = await this.rpc.call('starknet_estimateFee')({
				block_id: 'latest',
				request: [rawTx],
				simulation_flags: [],
			});
			if (!gasResponse.success) {
				if (gasResponse.error.code === 41) {
					// TODO notEnoughGas ?
					console.error(gasResponse.error.message);
					return {notEnoughGas: true, revert: true};
				}
				return {revert: 'unknown'}; // TODO add error message
			}
			const gasEstimate = gasResponse.value[0];
			const {data_gas_consumed, data_gas_price, gas_consumed, gas_price, overall_fee, unit} = gasEstimate;
			gasRequired = BigInt(gas_consumed) + BigInt(data_gas_consumed); // TODO check
		} catch (err: any) {
			return {revert: 'unknown'}; // TODO add error message
		}
		if (transactionData.version === '0x1') {
			return {notEnoughGas: gasRequired > BigInt(transactionData.max_fee) ? true : false, revert: false};
		} else if (transactionData.version === '0x3') {
			throw new Error(`transaction of version ${transactionData.version} not supported`);
			// TODO
			// return {notEnoughGas: gasRequired > BigInt(transactionData.) ? true : false, revert: false};
		} else {
			throw new Error(`transaction of version ${transactionData.version} not supported`);
		}
	}

	async computeMaxCostAuthorized(
		chainId: IntegerString,
		transactionData: StarknetTransactionData,
		maxFeePerGasAuthorized: String0x,
	): Promise<bigint> {
		// TODO for v3: maxFeePerGasAuthorized and transactionParameters
		const maxCost = BigInt(transactionData.max_fee);

		return maxCost;
	}

	async signTransaction(
		chainId: IntegerString,
		data: StarknetTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): Promise<{
		rawTx: any;
		hash: String0x;
	}> {
		const {transactionData, hash, rawTx} = this._createFullTransaction(
			chainId,
			data,
			broadcaster,
			transactionParameters,
		);

		return {hash, rawTx};
	}

	// async signVoidTransaction(
	// 	chainId: IntegerString,
	// 	broadcaster: BroadcasterSignerData,
	// 	transactionParameters: TransactionParametersUsed,
	// ): Promise<{
	// 	rawTx: any;
	// 	hash: String0x;
	// 	transactionData: StarknetTransactionData;
	// 	isVoidTransaction: boolean;
	// }> {

	// }

	requiredPreliminaryTransaction(
		chainId: string,
		broadcaster: BroadcasterSignerData,
		account: String0x,
	): StarknetTransactionData {
		const chainId0x = `0x${Number(chainId).toString(16)}`;
		const [protocol, protocolData] = broadcaster.signer.split(':');
		let privateKey: String0x;
		if (protocol === 'privateKey') {
			privateKey = protocolData as String0x;
		} else {
			throw new Error(`protocol ${protocol} not supported`);
		}
		const publicKey = getStarkKey(privateKey);

		const {data} = create_deploy_account_transaction_intent_v1({
			chain_id: chainId0x,
			class_hash: this.config.accountContractClassHash,
			constructor_calldata: [publicKey],
			contract_address_salt: publicKey,
			max_fee: '0xFFFFFFFFFFFFFFF', // TODO
			nonce: 0,
		});

		return {
			type: data.type,
			max_fee: data.max_fee as String0x, // TODO create_deploy_account_transaction_intent_v1 fix
			version: data.version as `0x1`, // TODO  create_deploy_account_transaction_intent_v1 should return 0x1 unless specific option is given
			class_hash: data.class_hash as String0x, // TODO create_deploy_account_transaction_intent_v1 fix
			contract_address_salt: data.contract_address_salt as String0x, // TODO create_deploy_account_transaction_intent_v1 fix
			constructor_calldata: data.constructor_calldata as String0x[], // TODO create_deploy_account_transaction_intent_v1 fix
		};
	}

	generatePaymentTransaction(
		transactionData: StarknetTransactionData,
		maxFeePerGas: bigint,
		from: String0x,
		diffToCover: bigint,
	): {transaction: StarknetTransactionData; cost: bigint; valueSent: bigint} {
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

		const calldata = getExecuteCalldata([actualCall], '1') as String0x[];

		const transactionToBroadcast: StarknetTransactionData = {
			type: 'INVOKE',
			calldata,
			version: '0x1',
			max_fee: `0x${gas.toString(16)}` as String0x,
		};
		return {transaction: transactionToBroadcast, cost, valueSent: valueToSend};
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

	async _validateDerivationParameters(
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

	// TODO remote-account : export this type: ReturnType<typeof initAccountFromHD>
	async _getStarknetSigner(
		account: ReturnType<typeof initAccountFromHD>,
		forAddress: String0x,
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

	_createFullTransaction(
		chainId: IntegerString,
		transactionData: StarknetTransactionData,
		broadcaster: BroadcasterSignerData,
		transactionParameters: TransactionParametersUsed,
	): {rawTx: FullStarknetTransactionData; transactionData: StarknetTransactionData; hash: String0x} {
		const chainId0x = `0x${Number(chainId).toString(16)}`;
		const [protocol, protocolData] = broadcaster.signer.split(':');
		let privateKey: String0x;
		if (protocol === 'privateKey') {
			privateKey = protocolData as String0x;
		} else {
			throw new Error(`protocol ${protocol} not supported`);
		}

		if (transactionData.version === '0x1') {
			if (!transactionData.max_fee) {
				throw new Error(`invalid transaction data, no max_fee parameter`);
			}
			if (transactionData.type === 'INVOKE') {
				const intent = create_invoke_transaction_intent_v1({
					...transactionData,
					chain_id: chainId0x,
					nonce: transactionParameters.nonce,
					sender_address: broadcaster.address,
				});
				const signature = formatSignature(sign(intent.hash, privateKey));

				return {
					transactionData,
					rawTx: {
						...intent.data,
						signature,
					},
					hash: intent.hash as String0x,
				};
			} else if (transactionData.type === 'DEPLOY_ACCOUNT') {
				const intent = create_deploy_account_transaction_intent_v1({
					...transactionData,
					chain_id: chainId0x,
					nonce: transactionParameters.nonce,
				});
				const signature = formatSignature(sign(intent.hash, privateKey));

				return {
					transactionData,
					rawTx: {
						...intent.data,
						signature,
					},
					hash: intent.hash as String0x,
				};
			} else {
				throw new Error(`transaction type "${(transactionData as any).type}" not supported`);
			}
		} else {
			throw new Error(`transaction with version: "${transactionData.version}" not supported`);
		}
	}
}

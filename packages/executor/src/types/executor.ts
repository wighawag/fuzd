import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents, EIP1193SignerProvider} from 'eip-1193';
import {EIP1193TransactionDataUsed, ExecutorStorage} from './executor-storage';
import {
	SchemaEIP1193AccessList,
	SchemaEIP1193Account,
	SchemaEIP1193Quantity,
	SchemaString0x,
	type Time,
} from 'fuzd-common';
import {z} from 'zod';

const FeePerGas = z.object({
	maxFeePerGas: SchemaEIP1193Quantity,
	maxPriorityFeePerGas: SchemaEIP1193Quantity,
});
export type FeePerGas = z.infer<typeof FeePerGas>;

const FeePerGasPeriod = FeePerGas.extend({
	duration: SchemaEIP1193Quantity,
});
export type FeePerGasPeriod = z.infer<typeof FeePerGasPeriod>;

const BroadcastSchedule = z.array(FeePerGasPeriod).nonempty();
export type BroadcastSchedule = z.infer<typeof BroadcastSchedule>;
// export type BroadcastSchedule = FeePerGasPeriod[];

// ------------------------------------------------------------------------------------------------
// TransactionSubmission
// ------------------------------------------------------------------------------------------------
export const SchemaTransactionSubmission = z.object({
	to: SchemaEIP1193Account.optional(),
	gas: SchemaEIP1193Quantity,
	data: SchemaString0x.optional(),
	type: z.literal('0x2'),
	chainId: SchemaEIP1193Quantity,
	accessList: SchemaEIP1193AccessList.optional(),
	broadcastSchedule: BroadcastSchedule,
	expiryTime: z.number().optional(),
});
export type TransactionSubmission = z.infer<typeof SchemaTransactionSubmission>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionInfo
// ------------------------------------------------------------------------------------------------
export type TransactionInfo = {
	hash: EIP1193DATA;
	broadcastTime: number;
	transactionData: EIP1193TransactionDataUsed;
	isVoidTransaction: boolean;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// RawTransactionInfo
// ------------------------------------------------------------------------------------------------
export type RawTransactionInfo = {
	rawTx: EIP1193DATA;
	transactionData: EIP1193TransactionDataUsed;
	isVoidTransaction: boolean;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfig
// ------------------------------------------------------------------------------------------------
export type ChainConfig = {
	provider: EIP1193ProviderWithoutEvents;
	finality: number;
	worstCaseBlockTime: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfigs
// ------------------------------------------------------------------------------------------------
export type ChainConfigs = {
	[chainId: `0x${string}`]: ChainConfig;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {assignerID: string; signer: EIP1193SignerProvider; address: EIP1193Account};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Signers
// ------------------------------------------------------------------------------------------------
export type Signers = {
	assignProviderFor: (chainId: `0x${string}`, account: EIP1193Account) => Promise<BroadcasterSignerData>;
	getProviderByAssignerID: (assignerID: string, address: EIP1193Account) => Promise<BroadcasterSignerData>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutorConfig
// ------------------------------------------------------------------------------------------------
export type ExecutorConfig = {
	chainConfigs: ChainConfigs;
	time: Time;
	storage: ExecutorStorage;
	signers: Signers;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType, TransactionInfoType> = {
	submitTransaction(
		slot: string,
		account: EIP1193Account,
		submission: TransactionDataType,
	): Promise<TransactionInfoType>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutorBackend
// ------------------------------------------------------------------------------------------------
export type ExecutorBackend = {
	processPendingTransactions(): Promise<void>;
	updateTransactionWithCurrentGasPrice(execution: {
		chainId: `0x${string}`;
		slot: string;
		account: `0x${string}`;
	}): Promise<'NotFound' | 'BetterFeeAlready' | 'Updated'>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionParams
// ------------------------------------------------------------------------------------------------
export type TransactionParams = {
	expectedNonce: number;
	nonce: number;
	gasRequired: bigint;
	revert: boolean;
};
// ------------------------------------------------------------------------------------------------

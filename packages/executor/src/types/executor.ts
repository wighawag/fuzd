import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents, EIP1193SignerProvider} from 'eip-1193';
import {EIP1193TransactionDataUsed, ExecutorStorage} from './executor-storage';
import {SchemaEIP1193AccessList, SchemaEIP1193Account, SchemaEIP1193Quantity, SchemaString0x} from 'fuzd-common';
import type {Time} from 'fuzd-common';
import z from 'zod';

// ------------------------------------------------------------------------------------------------
// FeePerGas
// ------------------------------------------------------------------------------------------------
const SchemaFeePerGas = z.object({
	maxFeePerGas: SchemaEIP1193Quantity,
	maxPriorityFeePerGas: SchemaEIP1193Quantity,
});
export type FeePerGas = z.infer<typeof SchemaFeePerGas>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FeePerGasPeriod
// ------------------------------------------------------------------------------------------------
const SchemaFeePerGasPeriod = SchemaFeePerGas.extend({
	duration: SchemaEIP1193Quantity,
});
export type FeePerGasPeriod = z.infer<typeof SchemaFeePerGasPeriod>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// BroadcastSchedule
// ------------------------------------------------------------------------------------------------
const SchemaBroadcastSchedule = z.array(SchemaFeePerGasPeriod).nonempty();
export type BroadcastSchedule = z.infer<typeof SchemaBroadcastSchedule>;
// export type BroadcastSchedule = FeePerGasPeriod[];
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
// Signers
// ------------------------------------------------------------------------------------------------
export type Signers = {
	assignProviderFor: (chainId: `0x${string}`, account: EIP1193Account) => Promise<BroadcasterSignerData>;
	getProviderByAssignerID: (assignerID: string, address: EIP1193Account) => Promise<BroadcasterSignerData>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {assignerID: string; signer: EIP1193SignerProvider; address: EIP1193Account};
// ------------------------------------------------------------------------------------------------

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
	broadcastSchedule: SchemaBroadcastSchedule,
	expiryTime: z.number().optional(),
});
export type TransactionSubmission = z.infer<typeof SchemaTransactionSubmission>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutorBackend
// ------------------------------------------------------------------------------------------------
export type ExecutorBackend = {
	processPendingTransactions(): Promise<void>;
	// TODO remove:
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

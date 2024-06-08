import {EIP1193DATA} from 'eip-1193';
import {
	EIP1193TransactionDataUsed,
	SchemaEIP1193AccessList,
	SchemaEIP1193Account,
	SchemaEIP1193Quantity,
	SchemaString0x,
} from 'fuzd-common';
import z from 'zod';

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
// TransactionData
// ------------------------------------------------------------------------------------------------
export const SchemaTransactionData = z.object({
	to: SchemaEIP1193Account.optional(),
	gas: SchemaEIP1193Quantity,
	data: SchemaString0x.optional(),
	value: SchemaString0x.optional(),
	type: z.literal('0x2'),
	accessList: SchemaEIP1193AccessList.optional(),
});

export type TransactionData = z.infer<typeof SchemaTransactionData>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionSubmission
// ------------------------------------------------------------------------------------------------
export const SchemaExecutionSubmission = z.object({
	chainId: SchemaEIP1193Quantity,
	transaction: SchemaTransactionData,
	maxFeePerGasAuthorized: SchemaEIP1193Quantity,
	expiryTime: z.number().optional(),
	onBehalf: SchemaString0x.optional(),
});
export type ExecutionSubmission = z.infer<typeof SchemaExecutionSubmission>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutorBackend
// ------------------------------------------------------------------------------------------------
export type ExecutorBackend = {
	processPendingTransactions(): Promise<void>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionParams
// ------------------------------------------------------------------------------------------------
export type TransactionParams = {
	expectedNonce: number;
	nonce: number;
} & (
	| {
			revert: 'unknown';
	  }
	| {
			gasRequired: bigint;
			revert: boolean;
	  }
);
// ------------------------------------------------------------------------------------------------

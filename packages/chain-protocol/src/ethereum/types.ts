import {EIP1193TransactionData, EIP1193TransactionDataOfType2} from 'eip-1193';
import {SchemaEIP1193AccessList, SchemaEIP1193Account, SchemaEIP1193Quantity, SchemaString0x} from 'fuzd-common';
import z from 'zod';

// ------------------------------------------------------------------------------------------------
// TransactionData
// ------------------------------------------------------------------------------------------------
export const SchemaTransactionData = z.object({
	type: z.literal('0x2'),
	to: SchemaEIP1193Account.optional(),
	gas: SchemaEIP1193Quantity,
	data: SchemaString0x.optional(),
	value: SchemaString0x.optional(),
	accessList: SchemaEIP1193AccessList.optional(),
});

export type TransactionData = z.infer<typeof SchemaTransactionData>;
// ------------------------------------------------------------------------------------------------

export type FullTransactionData = EIP1193TransactionData;

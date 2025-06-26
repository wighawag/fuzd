import {EIP1193TransactionData} from 'eip-1193';
import {String0x, String0xSchema, ZodObjectShape} from 'fuzd-common';
import * as z from 'zod/v4';

// ------------------------------------------------------------------------------------------------
// TransactionData
// ------------------------------------------------------------------------------------------------
export type EthereumTransactionData = {
	type: '0x2';
	to?: String0x;
	gas: String0x;
	data?: String0x;
	value?: String0x;
	accessList?: {
		address: String0x;
		storageKeys: [String0x, ...String0x[]];
	}[];
};

// export const EthereumTransactionDataSchema2 = z.object<ZodObjectShape<EthereumTransactionData>>({
// 	type: z.literal('0x2'),
// 	to: String0xSchema.optional(),
// 	gas: String0xSchema,
// 	data: String0xSchema.optional(),
// 	value: String0xSchema.optional(),
// 	accessList: z
// 		.array(
// 			z.object({
// 				address: String0xSchema,
// 				storageKeys: z.array(String0xSchema).min(1),
// 			}) as unknown as z.ZodObject<
// 				ZodObjectShape<{
// 					address: String0x;
// 					storageKeys: [String0x, ...String0x[]];
// 				}>
// 			>,
// 		)
// 		.optional(),
// });

export const EthereumTransactionDataSchema = z.object({
	type: z.literal('0x2'),
	to: String0xSchema.optional(),
	gas: String0xSchema,
	data: String0xSchema.optional(),
	value: String0xSchema.optional(),
	accessList: z
		.array(
			z.object({
				address: String0xSchema,
				storageKeys: z.array(String0xSchema).min(1),
				// as type needed as `z.array(String0xSchema).min(1)` do not generate the correct type
			}) as unknown as z.ZodObject<
				ZodObjectShape<{
					address: String0x;
					storageKeys: [String0x, ...String0x[]];
				}>
			>,
		)
		.optional(),
}) satisfies z.ZodType<EthereumTransactionData>;
// ------------------------------------------------------------------------------------------------

export type FullEthereumTransactionData = EIP1193TransactionData;

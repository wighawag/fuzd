import {z} from 'zod';

import {
	EIP1193BlockNumberProvider,
	EIP1193CallProvider,
	EIP1193GetBlockByHashProvider,
	EIP1193GetBlockByNumberProvider,
} from 'eip-1193';

export type Time = {
	getTimestamp(
		provider: EIP1193CallProvider &
			EIP1193GetBlockByNumberProvider &
			EIP1193BlockNumberProvider &
			EIP1193GetBlockByHashProvider,
	): Promise<number>;
};

// ------------------------------------------------------------------------------------------------
// UTILITY TYPES
// ------------------------------------------------------------------------------------------------
const validateHex = (val: unknown) => {
	if (typeof val != 'string') {
		return false;
	}
	return val.startsWith('0x');
};

export const SchemaEIP1193Account = z.custom<`0x${string}`>((val) => {
	return validateHex(val) && val.length == 42;
});
export const SchemaEIP1193Bytes32 = z.custom<`0x${string}`>((val) => {
	return validateHex(val) && val.length == 66;
});
export const SchemaEIP1193Quantity = z.custom<`0x${string}`>((val) => {
	return validateHex(val) && val.length > 2 && val.length <= 66;
});
export const EIP1193AccessListEntrySchema = z.object({
	address: SchemaEIP1193Account,
	storageKeys: z.array(SchemaEIP1193Bytes32).nonempty(),
});
export const SchemaEIP1193AccessList = z.array(EIP1193AccessListEntrySchema);

export const SchemaString0x = z
	.custom<`0x${string}`>((val) => {
		return validateHex(val);
	}, 'do not start with 0x')
	.transform((v) => v.toLowerCase() as `0x${string}`);

export type String0x = z.infer<typeof SchemaString0x>;

// ------------------------------------------------------------------------------------------------

import {z} from 'zod';

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

// from https://dev.to/safareli/pick-omit-and-union-types-in-typescript-4nd9
type Keys<T> = keyof T;
type DistributiveKeys<T> = T extends unknown ? Keys<T> : never;

type Pick_<T, K> = Pick<T, Extract<keyof T, K>>;
export type DistributivePick<T, K extends DistributiveKeys<T>> = T extends unknown
	? {[P in keyof Pick_<T, K>]: Pick_<T, K>[P]}
	: never;
type Omit_<T, K> = Omit<T, Extract<keyof T, K>>;
export type DistributiveOmit<T, K extends DistributiveKeys<T>> = T extends unknown
	? {[P in keyof Omit_<T, K>]: Omit_<T, K>[P]}
	: never;

export type RequiredKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

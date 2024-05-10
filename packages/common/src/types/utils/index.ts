import {z} from 'zod';

export const SchemaString0x = z.string().startsWith('0x').and(z.custom<`0x${string}`>());

export type String0x = z.infer<typeof SchemaString0x>;

export const SchemaEIP1193Account = z
	.string()
	.startsWith('0x')
	.length(42)
	.transform((v) => v.toLowerCase() as `0x${string}`);

export const SchemaEIP1193Bytes32 = z.string().startsWith('0x').length(66);

export const SchemaEIP1193Quantity = z.string().startsWith('0x').max(66);

export const SchemaEIP1193AccessListEntry = z.object({
	address: SchemaEIP1193Account,
	storageKeys: z.array(SchemaEIP1193Bytes32).nonempty(),
});
export const SchemaEIP1193AccessList = z.array(SchemaEIP1193AccessListEntry);

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

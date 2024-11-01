import {tags} from 'typia';

export type String0x = `0x${string}` & tags.Pattern<'^0[xX][A-Fa-f0-9][A-Fa-f0-9]+$'>;

export type Bytes0x = String0x;

export type Bytes320x = String0x;

export type Value0x = String0x;

export type Value256Bit0x = String0x;

export type EthereumAccount = String0x;

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

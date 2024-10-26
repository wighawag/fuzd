export type String0x = `0x${string}`;

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

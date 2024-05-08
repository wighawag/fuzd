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

export const SchemaString0x = z
	.custom<`0x${string}`>((val) => {
		return typeof val === 'string' ? val.startsWith('0x') : false;
	}, 'do not start with 0x')
	.transform((v) => v.toLowerCase() as `0x${string}`);

export type String0x = z.infer<typeof SchemaString0x>;

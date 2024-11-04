import {String0x} from 'fuzd-common';

export type Env = {
	DB: D1Database;
	HD_MNEMONIC?: string;
	CONTRACT_TIMESTAMP?: String0x;
	[chainId: `CHAIN_0x${string}`]: string | undefined;
	TIME_LOCK_DECRYPTION?: 'false' | 'true';
	TOKEN_ADMIN?: string;
	LOGFLARE_API_KEY?: string;
	LOGFLARE_SOURCE?: string;
	NAMED_LOGS?: string;
	NAMED_LOGS_LEVEL?: string;
	DEV?: string;
};

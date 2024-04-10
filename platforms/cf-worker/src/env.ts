export interface Env {
	HD_MNEMONIC?: string;
	CONTRACT_TIMESTAMP?: `0x${string};`;
	[chainId: `CHAIN_0x${string}`]: string | undefined;
	SCHEDULER: DurableObjectNamespace;
	TIME_LOCK_DECRYPTION?: 'false' | 'true';
	TOKEN_ADMIN?: string;
	LOGFLARE_API_KEY?: string;
	LOGFLARE_SOURCE?: string;
}

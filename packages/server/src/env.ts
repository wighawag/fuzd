import {String0x} from '@fuzd/common';

export type Env = {
	HD_MNEMONIC?: string;
	CONTRACT_TIMESTAMP?: String0x;
	[chainId: `CHAIN_${string}`]: string | undefined;
	TIME_LOCK_DECRYPTION?: 'false' | 'true';
	TOKEN_ADMIN?: string;
	LOGFLARE_API_KEY?: string;
	LOGFLARE_SOURCE?: string;
	DEV?: string;
	/** processing budget of each processQueue / processTransactions run (see ProcessingBudget) */
	PROCESSING_BATCH_SIZE?: string;
	PROCESSING_CONCURRENCY?: string;
	PROCESSING_MAX_ITEMS_PER_RUN?: string;
	PROCESSING_MAX_DURATION_MS?: string;
};

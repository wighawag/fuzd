import {String0x} from '@fuzd/common';

export type Env = {
	DB: D1Database;
	HD_MNEMONIC?: string;
	CONTRACT_TIMESTAMP?: String0x;
	[chainId: `CHAIN_${string}`]: string | undefined;
	TIME_LOCK_DECRYPTION?: 'false' | 'true';
	TOKEN_ADMIN?: string;
	LOGFLARE_API_KEY?: string;
	LOGFLARE_SOURCE?: string;
	NAMED_LOGS?: string;
	NAMED_LOGS_LEVEL?: string;
	DEV?: string;
	/** processing budget of each processQueue / processTransactions run (see ProcessingBudget) */
	PROCESSING_BATCH_SIZE?: string;
	PROCESSING_CONCURRENCY?: string;
	PROCESSING_MAX_ITEMS_PER_RUN?: string;
	PROCESSING_MAX_DURATION_MS?: string;
	PROCESSING_LEASE_DURATION_MS?: string;
	/** how many broadcast executions one checkScheduledExecutionStatus run looks at per chain, 1000 by default */
	STATUS_CHECK_MAX_PER_RUN?: string;
	DISABLE_CRON?: string;
	/** the Durable Objects that run processQueue and processTransactions back to back (src/processing-loop.ts) */
	PROCESSING_LOOP?: DurableObjectNamespace;
	/** how many of them, 0 for none (the crons alone then); 1 by default */
	PROCESSING_LOOPS?: string;
	/** pause of a loop between two runs that found nothing more to do, 5000 by default */
	PROCESSING_LOOP_IDLE_MS?: string;
};

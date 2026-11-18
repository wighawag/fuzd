/**
 * How much one processing run (processQueue, processPendingTransactions) may do. A run keeps
 * pulling batches of due items until one of these is reached, so a burst of items all due at the
 * same time is drained by a few runs instead of a fixed handful per run.
 *
 * The defaults fit a Cloudflare Worker cron (30s of CPU, a capped number of D1 queries per
 * invocation, one run per minute): about 100 executions at roughly 9 statements each, finished well
 * before the next run starts.
 */
export type ProcessingBudget = {
	/** items fetched from storage at once */
	batchSize: number;
	/** items handled at the same time, the items of one group (one account) are never concurrent */
	concurrency: number;
	/** stop pulling new batches after this many items */
	maxItemsPerRun: number;
	/** stop pulling new batches after this long, so a run is over before the next one starts */
	maxDurationPerRunMs: number;
};

export const DEFAULT_PROCESSING_BUDGET: ProcessingBudget = {
	batchSize: 50,
	concurrency: 10,
	maxItemsPerRun: 100,
	maxDurationPerRunMs: 40_000,
};

export function resolveProcessingBudget(budget?: Partial<ProcessingBudget>): ProcessingBudget {
	const resolved = {...DEFAULT_PROCESSING_BUDGET};
	for (const key of Object.keys(resolved) as (keyof ProcessingBudget)[]) {
		const value = budget?.[key];
		if (value !== undefined && Number.isFinite(value) && Math.floor(value) >= 1) {
			resolved[key] = Math.floor(value);
		}
	}
	return resolved;
}

/**
 * Run `task` over `items`, `concurrency` groups at a time. Items sharing a key form a group and run
 * one after the other in the order given, so per-key ordering (an account's nonces) is kept while
 * different keys proceed in parallel. `task` must not throw: callers handle their own failures.
 */
export async function processInGroups<T>(
	items: readonly T[],
	keyOf: (item: T) => string,
	concurrency: number,
	task: (item: T) => Promise<void>,
): Promise<void> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		const group = groups.get(key);
		if (group) {
			group.push(item);
		} else {
			groups.set(key, [item]);
		}
	}
	const queue = [...groups.values()];
	let next = 0;
	const workers = Array.from({length: Math.max(1, Math.min(concurrency, queue.length))}, async () => {
		while (next < queue.length) {
			const group = queue[next++];
			for (const item of group) {
				await task(item);
			}
		}
	});
	await Promise.all(workers);
}

/**
 * Seconds to wait before retrying an item that failed `retries` times: 5s doubling up to 2 minutes.
 * Short enough that an item fixed during a reveal window (an account funded late) still goes out,
 * long enough that a failing item stops competing with the others.
 */
export function retryDelaySeconds(retries: number): number {
	return Math.min(5 * 2 ** Math.max(0, Math.min(retries - 1, 10)), 120);
}

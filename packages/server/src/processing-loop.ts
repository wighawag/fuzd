import type {InternalAction} from './api/internal/index.js';

/** What a processing loop needs from the server: `createServer(...)` provides both. */
export type InternalActionRunner = {
	fetch(request: Request): Response | Promise<Response>;
	internalRequest(action: InternalAction): Request;
};

/**
 * Run one internal action and tell whether to run it again at once: true when the run stopped on its
 * processing budget rather than for lack of due work (`budgetExhausted` in its response).
 */
export async function runInternalAction(app: InternalActionRunner, action: InternalAction): Promise<{more: boolean}> {
	const response = await app.fetch(app.internalRequest(action));
	if (!response.ok) {
		throw new Error(`${action} answered ${response.status}: ${await response.text()}`);
	}
	const json = (await response.json()) as {result?: {budgetExhausted?: boolean}; budgetExhausted?: boolean};
	return {more: json.budgetExhausted === true || json.result?.budgetExhausted === true};
}

export type ProcessingLoopOptions = {
	/** pause between two runs of an action that found nothing more to do */
	intervalMs: number;
	actions?: InternalAction[];
	onError?: (action: InternalAction, error: unknown) => void;
};

/**
 * Run each action over and over, each on its own: back to back while its runs stop on their budget
 * (a burst is due), every `intervalMs` otherwise. A run of an action never starts before its previous
 * one is over. Several loops (processes) on one database are safe: runs claim what they process
 * (docs/adr/0004-claim-due-items-with-a-lease.md).
 */
export function createProcessingLoop(app: InternalActionRunner, options: ProcessingLoopOptions) {
	const actions = options.actions || ['processQueue', 'processTransactions', 'checkScheduledExecutionStatus'];
	let stopped = false;
	const wakeUps = new Set<() => void>();
	const pause = (ms: number) =>
		new Promise<void>((resolve) => {
			const wake = () => {
				clearTimeout(timer);
				wakeUps.delete(wake);
				resolve();
			};
			const timer = setTimeout(wake, ms);
			wakeUps.add(wake);
		});

	async function loop(action: InternalAction) {
		while (!stopped) {
			let more = false;
			try {
				more = (await runInternalAction(app, action)).more;
			} catch (err) {
				if (options.onError) {
					options.onError(action, err);
				} else {
					console.error(`${action} failed: ${err}`);
				}
			}
			if (!more && !stopped) {
				await pause(options.intervalMs);
			}
		}
	}

	const loops = actions.map(loop);
	return {
		/** Stop starting runs, and wait for the ones in progress. */
		async stop() {
			stopped = true;
			for (const wake of [...wakeUps]) wake();
			await Promise.all(loops);
		},
	};
}

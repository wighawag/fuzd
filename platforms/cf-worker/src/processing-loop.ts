import {logs} from 'named-logs';
import {runInternalAction, type InternalAction, type InternalActionRunner} from '@fuzd/server';
import {Env} from './env.js';
import {wrapWithLogger} from './logging/index.js';

const logger = logs('fuzd-cf-worker-processing-loop');

const LOOP_ACTIONS: InternalAction[] = ['processQueue', 'processTransactions'];

export function processingLoopSettings(env: Env) {
	const count = env.PROCESSING_LOOP && env.PROCESSING_LOOPS !== undefined ? parseInt(env.PROCESSING_LOOPS) : 1;
	const idleMs = env.PROCESSING_LOOP_IDLE_MS !== undefined ? parseInt(env.PROCESSING_LOOP_IDLE_MS) : 5000;
	return {
		count: env.PROCESSING_LOOP && !env.DISABLE_CRON && Number.isFinite(count) && count > 0 ? count : 0,
		idleMs: Number.isFinite(idleMs) && idleMs >= 0 ? idleMs : 5000,
	};
}

/**
 * Make sure every loop of the pool is running. The cron calls it every minute: a loop starts on the
 * first call after a deploy, and again if its alarm ever stopped (retries exhausted).
 */
export async function startProcessingLoops(env: Env) {
	const {count} = processingLoopSettings(env);
	const namespace = env.PROCESSING_LOOP;
	if (!namespace) return;
	await Promise.all(
		Array.from({length: count}, (_, index) =>
			namespace
				.get(namespace.idFromName(`processing-loop-${index}`))
				.fetch(`https://processing-loop/start?index=${index}`)
				.then((response) => response.arrayBuffer()),
		),
	);
}

/**
 * One loop of the processing pool (docs/adr/0004-claim-due-items-with-a-lease.md): its alarm runs
 * processQueue then processTransactions, and fires again at once while a run stopped on its budget,
 * else after PROCESSING_LOOP_IDLE_MS. Each alarm is a new invocation with its own CPU limit, and the
 * loops of the pool run in parallel: the runs claim what they process, so they never share an item.
 * The crons keep running the same actions every minute, as a fallback.
 */
export function createProcessingLoopClass(getApp: (env: Env, ctx: ExecutionContext) => InternalActionRunner) {
	return class ProcessingLoop implements DurableObject {
		constructor(
			private state: DurableObjectState,
			private env: Env,
		) {}

		async fetch(request: Request): Promise<Response> {
			const index = Number(new URL(request.url).searchParams.get('index'));
			if (Number.isInteger(index) && index >= 0) {
				await this.state.storage.put('index', index);
			}
			if ((await this.state.storage.getAlarm()) === null) {
				await this.state.storage.setAlarm(Date.now());
			}
			return new Response('started');
		}

		async alarm(): Promise<void> {
			const {count, idleMs} = processingLoopSettings(this.env);
			const index = (await this.state.storage.get<number>('index')) ?? 0;
			if (index >= count) {
				// the pool was made smaller, or the crons disabled: this loop stops (no next alarm)
				return;
			}
			// the next alarm is set before the work: a run that is killed (CPU limit) does not stop the loop
			await this.state.storage.setAlarm(Date.now() + idleMs);

			const ctx = {
				waitUntil: (promise: Promise<unknown>) => this.state.waitUntil(promise),
				passThroughOnException() {},
			} as ExecutionContext;
			let more = false;
			await wrapWithLogger(new Request('https://scheduler.fuzd.dev/processing-loop'), this.env, ctx, async () => {
				const app = getApp(this.env, ctx);
				for (const action of LOOP_ACTIONS) {
					try {
						more = (await runInternalAction(app, action)).more || more;
					} catch (err: any) {
						logger.error(`processing loop ${index}: ${action} failed: ${err.message || err}`);
					}
				}
				return new Response(more ? 'more' : 'idle');
			});
			if (more) {
				await this.state.storage.setAlarm(Date.now());
			}
		}
	};
}

// ------------------------------------------------------------------------------------------------
// Logging
// ------------------------------------------------------------------------------------------------
import 'named-logs-context';
import {enable as enableWorkersLogger} from 'workers-logger';
import {logs} from 'named-logs';
// ------------------------------------------------------------------------------------------------
import {createServer, type InternalAction} from '@fuzd/server';
import {RemoteD1} from 'remote-sql-d1';
import {Env} from './env.js';
import {ExecutionContext} from '@cloudflare/workers-types/experimental';
import {wrapWithLogger} from './logging/index.js';
import {createProcessingLoopClass, startProcessingLoops} from './processing-loop.js';

// ------------------------------------------------------------------------------------------------
enableWorkersLogger('*');
const logger = logs('fuzd-cf-worker');
// ------------------------------------------------------------------------------------------------

export const app = createServer<Env>({
	getDB: (c) => new RemoteD1(c.env.DB),
	getEnv: (c) => c.env,
});

/** The Durable Object class of the processing loops (bound as PROCESSING_LOOP in wrangler.toml). */
export const ProcessingLoop = createProcessingLoopClass((env, ctx) => ({
	fetch: (request) => app.fetch(request, env, ctx as any),
	internalRequest: (action) => app.internalRequest(action),
}));

const fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(request, env, ctx, async () => {
		return app.fetch(request, env, ctx);
	});
};

const cronInternalActions: Record<string, InternalAction> = {
	'* * * * *': 'processQueue',
	'*/1 * * * *': 'processTransactions',
	'*/2 * * * *': 'checkScheduledExecutionStatus',
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	if (env.DISABLE_CRON) {
		return new Response(`CRON ARE DISABLED`, {
			status: 200,
		});
	}
	const action = cronInternalActions[event.cron];
	return wrapWithLogger(new Request(`https://scheduler.fuzd.dev/${action || event.cron}`), env, ctx, async () => {
		if (action) {
			if (action === 'processQueue') {
				// the loops do most of the processing; this keeps them running (see src/processing-loop.ts)
				ctx.waitUntil(
					startProcessingLoops(env).catch((err) => logger.error(`could not start the processing loops: ${err}`)),
				);
			}
			return app.fetch(app.internalRequest(action), env, ctx);
		} else {
			return new Response(`invalid CRON`, {
				status: 500,
			});
		}
	});
};

export default {
	fetch,
	scheduled,
};

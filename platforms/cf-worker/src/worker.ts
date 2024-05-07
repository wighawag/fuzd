import {createServer} from 'fuzd-server';
import type {Context} from 'hono';
import {RemoteD1} from 'remote-sql-d1';
import {Env} from './env';
import {logs} from 'named-logs';
import {track, enable as enableWorkersLogger} from 'workers-logger';
import {ExecutionContext} from '@cloudflare/workers-types/experimental';
import {LOG_LEVEL, logflareReport} from './utils/logflare';

enableWorkersLogger('*');
(globalThis as any)._logFactory.enable('*');
(globalThis as any)._logFactory.level = LOG_LEVEL;
const logger = logs('worker');

async function wrapWithLogger(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	callback: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>,
): Promise<Response> {
	const _trackLogger = track(
		request,
		'FUZD.cloudflare',
		env.LOGFLARE_API_KEY && env.LOGFLARE_SOURCE
			? logflareReport({apiKey: env.LOGFLARE_API_KEY, source: env.LOGFLARE_SOURCE})
			: undefined,
	);
	// const trackLogger = new Proxy(_trackLogger, {
	// 	get(t, p) {
	// 		return (...args: any[]) => {
	// 			if (p === 'log' || p === 'error' || p === 'info') {
	// 				console[p](...args);
	// 			}
	// 			(_trackLogger as any)[p](...args);
	// 		};
	// 	},
	// });
	const response = await (globalThis as any)._runWithLogger(_trackLogger, () => {
		return callback(request, env, ctx).catch((err) => {
			return new Response(err, {
				status: 500,
				statusText: err.message,
			});
		});
	});
	const p = _trackLogger.report(response || new Response('Scheduled Action Done'));
	if (p) {
		ctx.waitUntil(p);
	}
	return response;
}

export const app = createServer<Env>({
	getDB: (c: Context<{Bindings: Env}>) => new RemoteD1(c.env.DB),
	getEnv: (c: Context<{Bindings: Env}>) => c.env,
});

const fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(request, env, ctx, async () => app.fetch(request, env, ctx));
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(new Request(`https://scheduler.fuzd.dev/${event.cron}`), env, ctx, async () => {
		if (event.cron === '* * * * *') {
			return app.fetch(new Request('http://localhost/api/internal/processQueue'), env, ctx);
		} else if (event.cron === '*/1 * * * *') {
			return app.fetch(new Request('http://localhost/api/internal/processTransactions'), env, ctx);
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

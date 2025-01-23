import 'named-logs-context';
import {createServer} from 'fuzd-server';
import {RemoteD1} from 'remote-sql-d1';
import {Env} from './env.js';
import {logs} from 'named-logs';
import {track, enable as enableWorkersLogger} from 'workers-logger';
import {ExecutionContext} from '@cloudflare/workers-types/experimental';
import {logflareReport} from './utils/logflare.js';
import {consoleReporter} from './utils/basicReporters.js';
enableWorkersLogger('*');
const logger = logs('worker');

async function wrapWithLogger(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	callback: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>,
): Promise<Response> {
	const namespaces = env.NAMED_LOGS || '*';
	let logLevel = 6;
	if (env.NAMED_LOGS_LEVEL) {
		const level = parseInt(env.NAMED_LOGS_LEVEL);
		if (!isNaN(level)) {
			logLevel = level;
		}
	}
	if ((globalThis as any)._logFactory) {
		(globalThis as any)._logFactory.enable(namespaces);
		(globalThis as any)._logFactory.level = logLevel;
	} else {
		console.error(`no log factory`);
	}

	const _trackLogger = track(
		request,
		'FUZD.cloudflare',
		env.LOGFLARE_API_KEY && env.LOGFLARE_SOURCE
			? logflareReport({apiKey: env.LOGFLARE_API_KEY, source: env.LOGFLARE_SOURCE})
			: consoleReporter,
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
	getDB: (c) => new RemoteD1(c.env.DB),
	getEnv: (c) => c.env,
});

const fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(request, env, ctx, async () => {
		return app.fetch(request, env, ctx);
	});
};

const cronInternalActions: Record<string, string> = {
	'* * * * *': 'processQueue',
	'*/1 * * * *': 'processTransactions',
	'*/2 * * * *': 'checkScheduledExecutionStatus',
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(
		new Request(`https://scheduler.fuzd.dev/${cronInternalActions[event.cron] || event.cron}`),
		env,
		ctx,
		async () => {
			const action = cronInternalActions[event.cron];
			if (action) {
				return app.fetch(new Request(`http://localhost/internal/${action}`), env, ctx);
			} else {
				return new Response(`invalid CRON`, {
					status: 500,
				});
			}
		},
	);
};

export default {
	fetch,
	scheduled,
};

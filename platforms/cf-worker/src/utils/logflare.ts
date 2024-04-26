import type {LogEvent, Reporter} from 'workers-logger';
import {format, track} from 'workers-logger';
import {Env} from '../env';

export const LOG_LEVEL = 2; // TODO env variable

// TODO lib ?
export const logflareReport: ({apiKey, source}: {apiKey: string; source: string}) => Reporter = ({apiKey, source}) => {
	return (events: LogEvent[], {req, res}: {req: Request; res: Response}) => {
		const url = new URL(req.url);

		const logs = events.map((i) => ({
			level: i.level,
			message: format(i.message, ...i.extra),
			error: i.error
				? {
						name: i.error.name,
						message: i.error.message,
						stack: i.error.stack,
					}
				: undefined,
		}));
		let firstError;
		for (const l of logs) {
			if (l.error) {
				firstError = l.error;
				break;
			}
		}
		const metadata = {
			method: req.method,
			pathname: url.pathname,
			headers: Object.fromEntries(req.headers),
			response: {
				status: res.status,
				headers: Object.fromEntries(res.headers),
			},
			log: logs,
			firstError,
		};

		const message = `${req.headers.get('cf-connecting-ip')} (${req.headers.get('cf-ray')}) ${req.method} ${req.url} ${res.status}`;

		return fetch('https://api.logflare.app/logs', {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				source,
				log_entry: message,
				metadata,
			}),
		});
	};
};

export async function wrapWithLogger(
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

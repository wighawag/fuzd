import {logs} from 'named-logs';
import {IRequest, Router, createCors, error, json} from 'itty-router';
import {withDurables} from 'itty-durable';
import {SchedulerDO} from './SchedulerDO';
import {withAuthorization} from './authentication';
import {clear, table} from './pages/clear';
import {Env} from './env';
import {track, enable as enableWorkersLogger} from 'workers-logger';
import {ExecutionContext} from '@cloudflare/workers-types/experimental';
import {LOG_LEVEL, logflareReport} from './logflare';

enableWorkersLogger('*');
(globalThis as any)._logFactory.enable('*');
(globalThis as any)._logFactory.level = LOG_LEVEL;
const logger = logs('worker');

const {preflight, corsify} = createCors();

export {SchedulerDO} from './SchedulerDO';

type Responsify<Type> = {
	[Property in keyof Type]: Type[Property] extends (...args: any[]) => Promise<any>
		? (
				...args: Parameters<Type[Property]>
			) => Promise<Omit<Response, 'json'> & {json: () => ReturnType<Type[Property]>}>
		: Type[Property];
};

export const router = Router<IRequest & {SCHEDULER: {get(str: string): Responsify<SchedulerDO>}}>({base: '/'});

const SINGELTON = 'SINGLETON';

router
	.all('*', preflight)
	// add upstream middleware, allowing Durable access off the request
	.all('*', withDurables())

	.get('/robots.txt', () => new Response(''))

	// get the durable itself... returns json response, so no need to wrap
	.get('/', async (request) => {
		logger.warn('hello world');
		return new Response('fuzd api');
	})

	// get the durable itself... returns json response, so no need to wrap
	.get('/publicKey', ({SCHEDULER}) => SCHEDULER.get(SINGELTON).getPublicKey())

	.get('/time/:chainId', ({SCHEDULER, params}) => SCHEDULER.get(SINGELTON).getTime(params.chainId))

	.get('/contractTimestamp', ({SCHEDULER}) => SCHEDULER.get(SINGELTON).getContractTimestamp())

	.post('/scheduleExecution', async (request) => {
		const jsonAsString = await request.text();
		const signature = request.headers.get('signature') as `0x${string}`;
		const result = await request.SCHEDULER.get(SINGELTON).submitExecution(jsonAsString, signature);
		return json(result);
	})
	.post('/execute/:slot', async (request) => {
		const jsonAsString = await request.text();
		const signature = request.headers.get('signature') as `0x${string}`;
		const result = await request.SCHEDULER.get(SINGELTON).execute(request.params.slot, jsonAsString, signature);
		return json(result);
	})
	// TODO remove
	// .get('/deleteExecution/:chainId/:account/:slot', async (request) => {
	// 	const result = await request.SCHEDULER.get(SINGELTON).deleteExecution(
	// 		request.params.chainId as `0x${string}`,
	// 		request.params.account as `0x${string}`,
	// 		request.params.slot,
	// 	);
	// 	return json(result);
	// })

	// TODO authentication
	.get('/queue', async ({SCHEDULER}) => {
		const response = await SCHEDULER.get(SINGELTON).getQueue();
		const data = await response.json();
		return table({data, border: 1, whenNoData: 'No DATA'});
	})
	.get('/queue/json', async ({SCHEDULER}) => {
		const response = await SCHEDULER.get(SINGELTON).getQueue();
		return response;
	})
	.get('/transactions', async ({SCHEDULER}) => {
		const response = await SCHEDULER.get(SINGELTON).getPendingTransactions();
		const data = await response.json();
		return table({data, border: 1, whenNoData: 'No DATA'});
	})
	.get('/archived-transactions', async ({SCHEDULER}) => {
		const response = await SCHEDULER.get(SINGELTON).getArchivedExecutions();
		const data = await response.json();
		return table({data, border: 1, whenNoData: 'No DATA'});
	})

	.get('/queuedExecution/:chainId/:account/:slot', ({SCHEDULER, params}) =>
		SCHEDULER.get(SINGELTON).getQueuedExecution(
			params.chainId as `0x${string}`,
			params.account.toLowerCase() as `0x${string}`,
			params.slot,
		),
	)

	.get('broadcaster/:address', ({SCHEDULER, params}) =>
		SCHEDULER.get(SINGELTON).getBroadcaster(params.address as `0x${string}`),
	)

	.get('/updateTransactionWithCurrentGasPrice/:token/:chainId/:account/:slot', ({SCHEDULER, params}, env) => {
		const expectedToken = env['TOKEN_ADMIN'];
		if (params.token === expectedToken) {
			return SCHEDULER.get(SINGELTON).updateTransactionWithCurrentGasPrice(
				params.chainId as `0x${string}`,
				params.account.toLowerCase() as `0x${string}`,
				params.slot,
			);
		} else {
			return error(401, 'Not Authorized');
		}
	})

	.get('/queuedExecution/:chainId/:account', ({SCHEDULER, params}) =>
		SCHEDULER.get(SINGELTON).getQueuedExecutionsForAccount(
			params.chainId as `0x${string}`,
			params.account.toLowerCase() as `0x${string}`,
		),
	)

	// TODO authentication
	.get('/processQueue', ({SCHEDULER}) => SCHEDULER.get(SINGELTON).processQueue())
	.get('/processTransactions', ({SCHEDULER}) => SCHEDULER.get(SINGELTON).processPendingTransactions())

	.get('/clear/:token', ({params}) => clear(params.token))
	.post('*', withAuthorization('TOKEN_ADMIN'))
	.post('/clear', ({SCHEDULER}) => SCHEDULER.get(SINGELTON).clear())

	.all('*', () => error(404, 'Are you sure about that?'));

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

const fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(request, env, ctx, () =>
		router
			.handle(request, env, ctx)
			// .catch((err: Error) => {
			// 	return new Response(err.stack ? err.stack.toString() : err.toString());
			// })
			.catch(error)
			.then(corsify),
	);
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(new Request(`https://scheduler.fuzd.dev/${event.cron}`), env, ctx, async () => {
		logger.info(`CRON: ${event.cron}`);
		if (event.cron === '* * * * *') {
			return router.handle(new Request('http://localhost/processQueue'), env, ctx);
		} else if (event.cron === '*/1 * * * *') {
			return router.handle(new Request('http://localhost/processTransactions'), env, ctx);
		} else {
			return new Response(`invalid CRON`, {
				status: 500,
			});
		}
	});
};

// with itty, and using ES6 module syntax (required for DO), this is all you need
export default {
	fetch,
	scheduled,
};

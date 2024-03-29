import {IRequest, Router, createCors, error, json} from 'itty-router';
import {withDurables} from 'itty-durable';
import {SchedulerDO} from './SchedulerDO';
import {withAuthorization} from './authentication';
import {clear, table} from './pages/clear';
import {Env} from './env';

// TODO named-console detect _logFactory if exist
const Logger = (globalThis as any)._logFactory;
if (Logger) {
	Logger.enable('*');
	Logger.level = 6;
}

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
	.get('/', ({SCHEDULER}) => new Response('fuzd api'))

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

const fetch = (request: Request, ...args: any[]) => {
	return (
		router
			.handle(request, ...args)
			// .catch((err: Error) => {
			// 	return new Response(err.stack ? err.stack.toString() : err.toString());
			// })
			.catch(error)
			.then(corsify)
	);
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	await router.handle(new Request('http://localhost/processQueue'), env, ctx);
	await router.handle(new Request('http://localhost/processTransactions'), env, ctx);
};

// with itty, and using ES6 module syntax (required for DO), this is all you need
export default {
	fetch,
	scheduled,
};

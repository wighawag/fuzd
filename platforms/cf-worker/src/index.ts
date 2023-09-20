import {IRequest, Router, createCors, error, json} from 'itty-router';
import {withDurables} from 'itty-durable';
import {SchedulerDO} from './SchedulerDO';
import {withAuthorization} from './authentication';
import {clear, table} from './pages/clear';

// TODO named-console detect _logFactory if exist
const Logger = (globalThis as any)._logFactory;
if (Logger) {
	Logger.enable('*');
	Logger.level = 6;
}

const {preflight, corsify} = createCors();

export {SchedulerDO} from './SchedulerDO';
interface Env {
	SCHEDULER: DurableObjectNamespace;
}

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
	.get('/transactions', ({SCHEDULER}) => SCHEDULER.get(SINGELTON).getPendingTransactions())

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

// with itty, and using ES6 module syntax (required for DO), this is all you need
export default {
	fetch,
};

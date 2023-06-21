import {IRequest, Router, createCors, error, json} from 'itty-router';
import {withDurables} from 'itty-durable';
import {SchedulerDO} from './SchedulerDO';

// TODO named-console detect _logFactory if exist
const Logger = (globalThis as any)._logFactory;
Logger.enable('*');
Logger.level = 6;

const {preflight, corsify} = createCors();

export {SchedulerDO} from './SchedulerDO';
interface Env {
	SCHEDULER: DurableObjectNamespace;
}

export const router = Router<IRequest & {SCHEDULER: {get(str: string): SchedulerDO}}>({base: '/'});

router
	.all('*', preflight)
	// add upstream middleware, allowing Durable access off the request
	.all('*', withDurables())

	// get the durable itself... returns json response, so no need to wrap
	.get('/', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').home())

	// get the durable itself... returns json response, so no need to wrap
	.get('/publicKey', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').getPublicKey())

	.post('/scheduleExecution', async (request) => {
		const jsonAsString = await request.text();
		const signature = request.headers.get('signature') as `0x${string}`;
		const result = await request.SCHEDULER.get('SINGLETON').submitExecution(jsonAsString, signature);
		return json(result);
	})

	.get('/queue', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').getQueue())
	.get('/processQueue', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').processQueue())

	.get('/transactions', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').getPendingTransactions())
	.get('/processTransactions', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').processPendingTransactions())

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

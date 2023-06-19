import {IRequest, Router, createCors, error, json} from 'itty-router';
import {withDurables} from 'itty-durable';
import {SchedulerDO} from './SchedulerDO';

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
	.get('/json', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').toJSON())

	.post('/sendTransaction', async (request) => {
		const jsonAsString = await request.text();
		const signature = request.headers.get('signature') as `0x${string}`;
		const result = await request.SCHEDULER.get('SINGLETON').submitExecution(jsonAsString, signature);
		return json(result);
	})

	// // By using { autoReturn: true } in createDurable(), this method returns the contents
	// .get('/increment', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').increment())

	// // you can pass any serializable params to a method... (e.g. /counter/add/3/4 => 7)
	// .get('/add/:a?/:b?', withParams, ({SCHEDULER, a, b}) => SCHEDULER.get('SINGLETON').add(Number(a), Number(b)))

	// // reset the durable
	// .get('/reset', ({SCHEDULER}) => SCHEDULER.get('SINGLETON').reset())

	// 404 for everything else
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

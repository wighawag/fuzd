import {Router, error} from 'itty-router';
import {withDurables} from 'itty-durable';
import {ExecutorDO} from './ExecutorDO';

export {ExecutorDO} from './ExecutorDO';
interface Env {
	EXECUTOR: DurableObjectNamespace;
}

export const router = Router<{EXECUTOR: {get(str: string): ExecutorDO}}>({base: '/'});

router
	// add upstream middleware, allowing Durable access off the request
	.all('*', withDurables())

	// get the durable itself... returns json response, so no need to wrap
	.get('/', ({EXECUTOR}) => EXECUTOR.get('test').home())

	.get('/test2', ({EXECUTOR}) => EXECUTOR.get('test').home())

	// get the durable itself... returns json response, so no need to wrap
	.get('/json', ({EXECUTOR}) => EXECUTOR.get('test').toJSON())

	// // By using { autoReturn: true } in createDurable(), this method returns the contents
	// .get('/increment', ({EXECUTOR}) => EXECUTOR.get('test').increment())

	// // you can pass any serializable params to a method... (e.g. /counter/add/3/4 => 7)
	// .get('/add/:a?/:b?', withParams, ({EXECUTOR, a, b}) => EXECUTOR.get('test').add(Number(a), Number(b)))

	// // reset the durable
	// .get('/reset', ({EXECUTOR}) => EXECUTOR.get('test').reset())

	// 404 for everything else
	.all('*', () => error(404, 'Are you sure about that?'));

// with itty, and using ES6 module syntax (required for DO), this is all you need
export default {
	fetch: router.handle,
};

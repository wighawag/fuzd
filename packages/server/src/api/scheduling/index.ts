import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

export function getSchedulingAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const {getDB} = options;

	const app = new Hono<{Bindings: Env & {}}>().post('/publicKey', async (c) => {});

	// .post('/scheduleExecution', async (request) => {
	//     const jsonAsString = await request.text();
	//     const signature = request.headers.get('signature') as `0x${string}`;
	//     const result = await request.SCHEDULER.get(SINGELTON).submitExecution(jsonAsString, signature);
	//     return json(result);
	// })

	// .get('/queuedExecution/:chainId/:account/:slot', ({SCHEDULER, params}) =>
	//     SCHEDULER.get(SINGELTON).getQueuedExecution(
	//         params.chainId as `0x${string}`,
	//         params.account.toLowerCase() as `0x${string}`,
	//         params.slot,
	//     ),
	// )

	// .get('/queuedExecution/:chainId/:account', ({SCHEDULER, params}) =>
	//     SCHEDULER.get(SINGELTON).getQueuedExecutionsForAccount(
	//         params.chainId as `0x${string}`,
	//         params.account.toLowerCase() as `0x${string}`,
	//     ),
	// )

	return app;
}

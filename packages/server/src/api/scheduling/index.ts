import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

export function getSchedulingAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()

		.post('/scheduleExecution', async (c) => {
			const config = c.get('config');
			const jsonAsString = await c.req.text();
			const signature = c.req.header()['signature'] as `0x${string}`;
			const result = await config.gateway.submitExecutionAsJsonString(jsonAsString, signature);
			return c.json(result);
		})

		.get('/queuedExecution/:chainId/:account/:slot', async (c) => {
			const config = c.get('config');
			const execution = await config.schedulerStorage.getQueuedExecution({
				chainId: c.req.param('chainId') as `0x${string}`,
				account: c.req.param('account').toLowerCase() as `0x${string}`,
				slot: c.req.param('slot'),
			});
			return c.json(execution);
		})

		.get('/queuedExecution/:chainId/:account', async (c) => {
			const config = c.get('config');
			const executions = await config.schedulerStorage.getQueuedExecutionsForAccount({
				chainId: c.req.param('chainId') as `0x${string}`,
				account: c.req.param('account').toLowerCase() as `0x${string}`,
			});
			return c.json(executions);
		});

	return app;
}

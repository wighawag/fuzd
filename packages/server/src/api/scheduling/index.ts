import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

import {zValidator} from '@hono/zod-validator';
import zod from 'zod';
import {auth} from '../../auth';
import {GenericSchemaScheduledExecution} from 'fuzd-scheduler';

const SchemaAny = zod.any();

export function getSchedulingAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()

		.post(
			'/scheduleExecution',
			auth({debug: false}),
			zValidator('json', GenericSchemaScheduledExecution(SchemaAny)),
			async (c) => {
				const config = c.get('config');
				const account = c.get('account');
				const data = c.req.valid('json');

				const result = await config.scheduler.scheduleExecution(account, data);
				return c.json(result);
			},
		)

		.get('/reserved/:chainId/:account/:slot', async (c) => {
			const config = c.get('config');
			const slot = c.req.param('slot');
			const executions = await config.schedulerStorage.getUnFinalizedScheduledExecutionsPerAccount({
				chainId: c.req.param('chainId') as `0x${string}`,
				account: c.req.param('account').toLowerCase() as `0x${string}`,
				limit: 100,
			});
			const executionsToCount = executions.filter((v) => v.slot != slot);
			let total: bigint = 0n;
			for (const execution of executionsToCount) {
				total += execution.paymentReserve ? BigInt(execution.paymentReserve) : 0n;
			}
			return c.json({total: total.toString()});
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

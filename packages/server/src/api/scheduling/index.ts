import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {auth} from '../../auth.js';
import {ScheduledExecutionSchema} from 'fuzd-scheduler';
import {ExecutionSubmissionSchema, IntegerString, IntegerStringSchema, String0x, String0xSchema} from 'fuzd-common';
import {MyTransactionDataSchema} from '../../setup.js';
import {createErrorObject} from '../../utils/response.js';
import {Env} from '../../env.js';
import {zValidator} from '@hono/zod-validator';

export function getSchedulingAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()

		.post(
			'/scheduleExecution',
			auth({debug: false, signReception: true}),
			zValidator('json', ScheduledExecutionSchema(ExecutionSubmissionSchema(MyTransactionDataSchema))),
			async (c) => {
				try {
					const config = c.get('config');
					const account = c.get('account');
					const data = c.req.valid('json');
					const receptionSignature = c.get('receptionSignature');
					if (!receptionSignature) {
						throw new Error(`no reception signature set`);
					}

					const result = await config.scheduler.scheduleExecution(account, data);
					return c.json({success: true as const, info: result, signature: receptionSignature}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)

		// give the total reserved amount across all pending exevution, except for slot specified
		.get('/reserved/:chainId/:broadcaster/:slot', async (c) => {
			try {
				const config = c.get('config');
				const slot = c.req.param('slot');
				const chainId = IntegerStringSchema.parse(c.req.param('chainId'));
				const broadcaster = String0xSchema.parse(c.req.param('broadcaster'));

				const executions = await config.schedulerStorage.getUnFinalizedScheduledExecutionsPerBroadcaster({
					chainId,
					broadcaster,
					limit: 100,
				});
				const executionsToCount = executions.filter((v) => v.slot != slot);
				let total: bigint = 0n;
				for (const execution of executionsToCount) {
					total += execution.paymentReserve ? BigInt(execution.paymentReserve.amount) : 0n;
				}
				return c.json({success: true as const, total: total.toString()}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})

		.get('/scheduledExecution/:chainId/:account/:slot', async (c) => {
			try {
				const config = c.get('config');
				const chainId = IntegerStringSchema.parse(c.req.param('chainId'));
				const account = String0xSchema.parse(c.req.param('account'));

				const execution = await config.schedulerStorage.getQueuedExecution({
					chainId,
					account,
					slot: c.req.param('slot'),
				});
				return c.json({success: true as const, execution}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})

		.get('/scheduledExecutions/:chainId/:account', async (c) => {
			try {
				const config = c.get('config');
				const chainId = IntegerStringSchema.parse(c.req.param('chainId'));
				const account = String0xSchema.parse(c.req.param('account'));

				const executions = await config.schedulerStorage.getQueuedExecutionsForAccount({
					chainId,
					account,
				});
				return c.json({success: true as const, executions}, 200); // TODO pagination data
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	return app;
}

import {Hono} from 'hono';
import {z} from 'zod';
import {ServerOptions} from '../../types.js';
import {auth} from '../../auth.js';
import {createErrorObject} from '../../utils/response.js';
import {Env} from '../../env.js';
import {describe, validate} from '../../validation.js';
import {
	ChainIdAccountParamSchema,
	ChainIdAccountSlotParamSchema,
	ChainIdBroadcasterSlotParamSchema,
	ScheduledExecutionQueuedSchema,
	ScheduledExecutionSchema,
	ScheduleInfoSchema,
	String0xSchema,
	successResponse,
} from '../../schemas/index.js';

export function getSchedulingAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()

		.post(
			'/scheduleExecution',
			describe({
				description: 'schedule an execution, signed by the account submitting it (header `signature`)',
				response: successResponse({info: ScheduleInfoSchema, signature: String0xSchema}),
			}),
			auth({debug: false, signReception: true}),
			validate('json', ScheduledExecutionSchema),
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
		.get(
			'/reserved/:chainId/:broadcaster/:slot',
			describe({response: successResponse({total: z.string()})}),
			validate('param', ChainIdBroadcasterSlotParamSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId, broadcaster, slot} = c.req.valid('param');

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
			},
		)

		.get(
			'/scheduledExecution/:chainId/:account/:slot',
			describe({response: successResponse({execution: ScheduledExecutionQueuedSchema.optional()})}),
			validate('param', ChainIdAccountSlotParamSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId, account, slot} = c.req.valid('param');

					const execution = await config.schedulerStorage.getQueuedExecution({
						chainId,
						account,
						slot,
					});
					return c.json({success: true as const, execution}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)

		.get(
			'/scheduledExecutions/:chainId/:account',
			describe({response: successResponse({executions: z.array(ScheduledExecutionQueuedSchema)})}),
			validate('param', ChainIdAccountParamSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId, account} = c.req.valid('param');

					const executions = await config.schedulerStorage.getQueuedExecutionsForAccount({
						chainId,
						account,
					});
					return c.json({success: true as const, executions}, 200); // TODO pagination data
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		);

	return app;
}

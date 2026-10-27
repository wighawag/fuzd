import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {createErrorObject} from '../../utils/response.js';
import {Env} from '../../env.js';
import {auth} from '../../auth.js';
import {describe, validate} from '../../validation.js';
import {
	ChainIdAccountParamSchema,
	ChainIdParamSchema,
	ExecutionBroadcastSchema,
	ExecutionParamSchema,
	ExecutionResponseSchema,
	PendingExecutionStoredSchema,
	RemoteAccountInfoSchema,
	String0xSchema,
	successResponse,
} from '../../schemas/index.js';

export function getExecutionAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.get(
			'/remoteAccount/:chainId/:account',
			describe({response: successResponse({account: RemoteAccountInfoSchema})}),
			validate('param', ChainIdAccountParamSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId, account} = c.req.valid('param');
					const broadcasterInfo = await config.executor.getRemoteAccount(chainId, account);
					return c.json({success: true as const, account: broadcasterInfo}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)
		.get(
			'/paymentRemoteAccount/:chainId',
			describe({response: successResponse({account: RemoteAccountInfoSchema.optional()})}),
			validate('param', ChainIdParamSchema),
			async (c) => {
				try {
					const {chainId} = c.req.valid('param');
					const config = c.get('config');

					const paymentAccount = config.paymentAccount;
					if (paymentAccount) {
						const broadcasterInfo = await config.executor.getRemoteAccount(chainId, paymentAccount);
						return c.json({success: true as const, account: broadcasterInfo}, 200);
					} else {
						return c.json({success: true as const, account: undefined}, 200);
					}
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)

		.get(
			'/execution/:chainId/:account/:slot/:batchIndex',
			describe({response: successResponse({execution: PendingExecutionStoredSchema.optional()})}),
			validate('param', ExecutionParamSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId, account, slot, batchIndex} = c.req.valid('param');

					const execution = await config.executorStorage.getPendingExecution({
						chainId,
						account,
						slot,
						batchIndex,
					});
					return c.json({success: true as const, execution}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)

		.post(
			'/broadcastExecution',
			describe({
				description: 'broadcast an execution now, signed by the account submitting it (header `signature`)',
				response: successResponse({info: ExecutionResponseSchema, signature: String0xSchema}),
			}),
			auth({debug: false, signReception: true}),
			validate('json', ExecutionBroadcastSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const account = c.get('account');
					const data = c.req.valid('json');
					const receptionSignature = c.get('receptionSignature');
					if (!receptionSignature) {
						throw new Error(`no reception signature set`);
					}

					const {slot, serviceParameters, onBehalf, expiryTime, ...execution} = data;
					const result = await config.executor.broadcastExecution(slot, 0, account, execution, serviceParameters, {
						onBehalf,
						expiryTime,
					});
					return c.json({success: true as const, info: result, signature: receptionSignature}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		);

	return app;
}

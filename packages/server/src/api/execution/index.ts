import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {createErrorObject} from '../../utils/response.js';
import {ExecutionBroadcastSchema, IntegerString, IntegerStringSchema, String0x, String0xSchema} from 'fuzd-common';
import {Env} from '../../env.js';
import {auth} from '../../auth.js';
import {MyTransactionDataSchema} from '../../setup.js';
import {zValidator} from '@hono/zod-validator';
import * as z from 'zod/v4';

// const validate = createValidate<ExecutionBroadcast<MyTransactionData>>();

export function getExecutionAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.get('/remoteAccount/:chainId/:account', async (c) => {
			try {
				const config = c.get('config');
				const chainId = IntegerStringSchema.parse(c.req.param('chainId'));
				const account = String0xSchema.parse(c.req.param('account'));
				const broadcasterInfo = await config.executor.getRemoteAccount(chainId, account);
				return c.json({success: true as const, account: broadcasterInfo}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/paymentRemoteAccount/:chainId', async (c) => {
			try {
				const chainId = IntegerStringSchema.parse(c.req.param('chainId'));
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
		})

		.get('/execution/:chainId/:account/:slot/:batchIndex', async (c) => {
			try {
				const config = c.get('config');
				const chainId = IntegerStringSchema.parse(c.req.param('chainId'));

				const account = String0xSchema.parse(c.req.param('account'));
				const batchIndex = z.number().int().parse(c.req.param('batchIndex'));

				if (isNaN(batchIndex)) {
					throw new Error(`invalid batch index`);
				}

				const execution = await config.executorStorage.getPendingExecution({
					chainId,
					account,
					slot: c.req.param('slot'),
					batchIndex,
				});
				return c.json({success: true as const, execution}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})

		.post(
			'/broadcastExecution',
			auth({debug: false, signReception: true}),
			zValidator('json', ExecutionBroadcastSchema(MyTransactionDataSchema)),
			async (c) =>
				// : Promise<
				// 	| TypedResponse<{success: true; info: ExecutionResponse<MyTransactionData>; signature: String0x}, 200>
				// 	| TypedResponse<ErrorType, 500>
				// >
				{
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

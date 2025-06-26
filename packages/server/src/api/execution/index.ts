import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {createErrorObject} from '../../utils/response.js';
import {ExecutionBroadcastSchema, IntegerString, String0x} from 'fuzd-common';
import {Env} from '../../env.js';
import {auth} from '../../auth.js';
import {MyTransactionDataSchema} from '../../setup.js';
import {zValidator} from '@hono/zod-validator';

// const validate = createValidate<ExecutionBroadcast<MyTransactionData>>();

export function getExecutionAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.get('/remoteAccount/:chainId/:account', async (c) => {
			try {
				const config = c.get('config');
				const chainId = c.req.param('chainId') as IntegerString;
				const account = c.req.param('account').toLowerCase() as String0x; // .toLowerCase() to ensure consistency
				const broadcasterInfo = await config.executor.getRemoteAccount(chainId, account);
				return c.json({success: true as const, account: broadcasterInfo}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/paymentRemoteAccount/:chainId', async (c) => {
			try {
				const chainId = c.req.param('chainId') as IntegerString;
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
				const chainId = c.req.param('chainId') as IntegerString;

				// TODO refactor to remove these incongruuity between lowecase address and other
				// TODO use zod to parse all input
				const account = c.req.param('account').toLowerCase() as String0x; // .toLowerCase() to ensure consistency
				const batchIndex = parseInt(c.req.param('batchIndex'));

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

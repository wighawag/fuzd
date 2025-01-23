import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {assert, createValidate} from 'typia';
import {createErrorObject} from '../../utils/response.js';
import {ExecutionBroadcast, IntegerString, String0x} from 'fuzd-common';
import {Env} from '../../env.js';
import {auth} from '../../auth.js';
import {typiaValidator} from '@hono/typia-validator';
import {MyTransactionData} from '../../setup.js';

const validate = createValidate<ExecutionBroadcast<MyTransactionData>>();

export function getExecutionAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.get('/remoteAccount/:chainId/:account', async (c) => {
			try {
				const config = c.get('config');
				const chainId = assert<IntegerString>(c.req.param('chainId'));
				const account = assert<String0x>(c.req.param('account'));
				const broadcasterInfo = await config.executor.getRemoteAccount(chainId, account);
				return c.json({success: true as const, account: broadcasterInfo}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/paymentRemoteAccount/:chainId', async (c) => {
			try {
				const chainId = assert<IntegerString>(c.req.param('chainId'));
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

		.post(
			'/broadcastExecution',
			auth({debug: false, signReception: true}),
			typiaValidator('json', validate),
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

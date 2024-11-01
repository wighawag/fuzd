import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {basicAuth} from 'hono/basic-auth';
import {logs} from 'named-logs';
import {assert} from 'typia';
import {createErrorObject} from '../../utils/response.js';
import {String0x} from 'fuzd-common';

const logger = logs('fuzd-cf-worker-admin-api');

export function getAdminAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const tmp = new Hono<{Bindings: Env & {}}>()
		// TODO authentication
		.get('/queue', async (c) => {
			try {
				const config = c.get('config');
				const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
				return c.json({success: true as const, queue}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/account-submissions/:account', async (c) => {
			try {
				const config = c.get('config');
				const account = assert<String0x>(c.req.param('account'));
				const queue = await config.schedulerStorage.getAccountSubmissions(account, {limit: 100});
				return c.json({success: true as const, queue}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/executions', async (c) => {
			try {
				const config = c.get('config');
				const txs = await config.executorStorage.getPendingExecutions({limit: 100});
				return c.json({success: true as const, transactions: txs}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/all-executions', async (c) => {
			try {
				const config = c.get('config');
				const txs = await config.executorStorage.getAllExecutions({limit: 100});
				return c.json({success: true as const, transactions: txs}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/test/:message', async (c) => {
			try {
				const message = c.req.param('message');
				logger.info(message);
				return c.json({success: true as const, message}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	const authenticated = new Hono<{Bindings: Env & {}}>()
		.use(
			basicAuth({
				verifyUser: (username, password, c) => {
					return username === 'admin' && password === c.env.TOKEN_ADMIN;
				},
			}),
		)
		.get('/clear', async (c) => {
			try {
				const config = c.get('config');
				await config.executorStorage.clear();
				await config.schedulerStorage.clear();
				return c.json({success: true}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/setup', async (c) => {
			try {
				const config = c.get('config');
				await config.executorStorage.setup();
				await config.schedulerStorage.setup();
				return c.json({success: true}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/expectedGasPrice/:chainId', async (c) => {
			try {
				const config = c.get('config');
				let chainId = c.req.param('chainId');
				if (!chainId.startsWith('0x')) {
					chainId = `0x${Number(chainId).toString(16)}`;
				}
				const expectedGasPrice = await config.executorStorage.getExpectedWorstCaseGasPrice(chainId as String0x);
				return c.json(
					{
						success: true as const,
						current: expectedGasPrice.current?.toString(),
						updateTimestamp: expectedGasPrice.updateTimestamp,
						previous: expectedGasPrice.previous?.toString(),
					},
					200,
				);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/updateExpectedGasPrice/:chainId/:value', async (c) => {
			try {
				const config = c.get('config');
				let chainId = c.req.param('chainId');
				if (!chainId.startsWith('0x')) {
					chainId = `0x${Number(chainId).toString(16)}`;
				}
				const value = c.req.param('value');
				const timestamp = Math.floor(Date.now() / 1000);
				const expectedGasPrice = await config.executorStorage.updateExpectedWorstCaseGasPrice(
					chainId as String0x,
					timestamp,
					BigInt(value),
				);
				return c.json(
					{
						success: true as const,
						current: expectedGasPrice.current?.toString(),
						updateTimestamp: expectedGasPrice.updateTimestamp,
						previous: expectedGasPrice.previous?.toString(),
					},
					200,
				);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	const app = new Hono<{Bindings: Env & {}}>().route('/', tmp).route('/', authenticated);

	return app;
}

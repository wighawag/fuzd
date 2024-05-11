import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';
import {basicAuth} from 'hono/basic-auth';
import {logs} from 'named-logs';
import {SchemaEIP1193Account} from 'fuzd-common';

const logger = logs('fuzd-cf-worker-admin-api');

export function getAdminAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const tmp = new Hono<{Bindings: Env & {}}>()
		// TODO authentication
		.get('/queue', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
			return c.json(queue);
		})
		.get('/account-submissions/:account', async (c) => {
			const config = c.get('config');
			const account = SchemaEIP1193Account.parse(c.req.param('account'));
			const queue = await config.schedulerStorage.getAccountSubmissions(account, {limit: 100});
			return c.json(queue);
		})
		.get('/account-archived-submissions/:account', async (c) => {
			const config = c.get('config');
			const account = SchemaEIP1193Account.parse(c.req.param('account'));
			const queue = await config.schedulerStorage.getAccountArchivedSubmissions(account, {limit: 100});
			return c.json(queue);
		})
		.get('/transactions', async (c) => {
			const config = c.get('config');
			const txs = await config.executorStorage.getPendingExecutions({limit: 100});
			return c.json(txs);
		})
		.get('/archived-transactions', async (c) => {
			const config = c.get('config');
			const txs = await config.executorStorage.getArchivedBroadcastedExecutions({limit: 100});
			return c.json(txs);
		})
		.get('/test/:message', async (c) => {
			const message = c.req.param('message');
			logger.info(message);
			return c.json({message});
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
			const config = c.get('config');
			await config.executorStorage.clear();
			await config.schedulerStorage.clear();
			return c.json({ok: true});
		})
		.get('/setup', async (c) => {
			const config = c.get('config');
			await config.executorStorage.setup();
			await config.schedulerStorage.setup();
			return c.json({ok: true});
		})
		.get('/expectedGasPrice/:chainId', async (c) => {
			const config = c.get('config');
			let chainId = c.req.param('chainId');
			if (!chainId.startsWith('0x')) {
				chainId = `0x${Number(chainId).toString(16)}`;
			}
			const expectedGasPrice = await config.executorStorage.getExpectedGasPrice(chainId as `0x${string}`);
			return c.json({
				current: expectedGasPrice.current?.toString(),
				updateTimestamp: expectedGasPrice.updateTimestamp,
				previous: expectedGasPrice.previous?.toString(),
			});
		})
		.get('/updateExpectedGasPrice/:chainId/:value', async (c) => {
			const config = c.get('config');
			let chainId = c.req.param('chainId');
			if (!chainId.startsWith('0x')) {
				chainId = `0x${Number(chainId).toString(16)}`;
			}
			const value = c.req.param('value');
			const timestamp = Math.floor(Date.now() / 1000);
			const expectedGasPrice = await config.executorStorage.updateExpectedGasPrice(
				chainId as `0x${string}`,
				timestamp,
				BigInt(value),
			);
			return c.json({
				current: expectedGasPrice.current?.toString(),
				updateTimestamp: expectedGasPrice.updateTimestamp,
				previous: expectedGasPrice.previous?.toString(),
			});
		});

	const app = new Hono<{Bindings: Env & {}}>().route('/', tmp).route('/', authenticated);

	return app;
}

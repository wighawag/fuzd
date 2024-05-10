import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';
import {basicAuth} from 'hono/basic-auth';
import {logs} from 'named-logs';

const logger = logs('fuzd-cf-worker-admin-api');

export function getAdminAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const tmp = new Hono<{Bindings: Env & {}}>()
		// TODO authentication
		.get('/queue', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
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
		});

	const app = new Hono<{Bindings: Env & {}}>().route('/', tmp).route('/', authenticated);

	return app;
}

import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';
import {basicAuth} from 'hono/basic-auth';

export function getAdminAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const {getDB} = options;

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
			const txs = await config.executorStorage.getArchivedExecutions({limit: 100});
			return c.json(txs);
		});

	const authenticated = new Hono<{Bindings: Env & {}}>()
		.use(
			basicAuth({
				verifyUser: (username, password, c) => {
					return username === 'admin' && password === c.env.TOKEN_ADMIN;
				},
			}),
		)
		.post('/clear', async (c) => {});

	const app = new Hono<{Bindings: Env & {}}>().route('/', tmp).route('/', authenticated);

	return app;
}

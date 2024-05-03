import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

export function getInternalAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()
		.get('/processQueue', async (c) => {
			const config = c.get('config');
			await config.scheduler.processQueue();
		})
		.get('/processTransactions', async (c) => {
			const config = c.get('config');
			await config.executor.processPendingTransactions();
		});

	return app;
}

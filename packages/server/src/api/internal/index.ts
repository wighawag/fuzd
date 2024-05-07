import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';
import {logs} from 'named-logs';

const logger = logs('fuzd-server-internal-api');

export function getInternalAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()
		.get('/processQueue', async (c) => {
			logger.log('hello');
			console.log('console hello');
			const config = c.get('config');
			const response = await config.scheduler.processQueue();
			return c.json(response);
		})
		.get('/processTransactions', async (c) => {
			const config = c.get('config');
			await config.executor.processPendingTransactions();
			return c.json({ok: true}); // TODO return processed transactons ?
		});

	return app;
}

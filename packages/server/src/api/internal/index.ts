import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {logs} from 'named-logs';

const logger = logs('fuzd-server-internal-api');

export function getInternalAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()
		.get('/processQueue', async (c) => {
			const config = c.get('config');
			const result = await config.scheduler.processQueue();
			return c.json({success: true, result});
		})
		.get('/checkScheduledExecutionStatus', async (c) => {
			const config = c.get('config');
			const result = await config.scheduler.checkScheduledExecutionStatus();
			return c.json({success: true, result});
		})
		.get('/processTransactions', async (c) => {
			const config = c.get('config');
			await config.executor.processPendingTransactions();
			return c.json({success: true}); // TODO return processed transactons ?
		});

	return app;
}

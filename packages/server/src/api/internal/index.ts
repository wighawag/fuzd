import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {logs} from 'named-logs';
import {createErrorObject} from '../../utils/response.js';

const logger = logs('fuzd-server-internal-api');

export function getInternalAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()
		.get('/processQueue', async (c) => {
			try {
				const config = c.get('config');
				const result = await config.scheduler.processQueue();
				return c.json({success: true as const, result}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/processTransactions', async (c) => {
			try {
				const config = c.get('config');
				await config.executor.processPendingTransactions();
				return c.json({success: true}); // TODO return processed transactons ?
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	return app;
}

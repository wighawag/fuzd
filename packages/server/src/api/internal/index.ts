import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {logs} from 'named-logs';
import {createErrorObject} from '../../utils/response.js';
import {setup} from '../../setup.js';
import {Env} from '../../env.js';

const logger = logs('fuzd-server-internal-api');

export function getInternalAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.use(setup({serverOptions: options}))
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
		})
		.get('/checkScheduledExecutionStatus', async (c) => {
			try {
				const config = c.get('config');
				const result = await config.scheduler.checkScheduledExecutionStatus();
				return c.json({success: true as const, result}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	return app;
}

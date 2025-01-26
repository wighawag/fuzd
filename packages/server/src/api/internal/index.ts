import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {logs} from 'named-logs';
import {createErrorObject} from '../../utils/response.js';
import {setup} from '../../setup.js';
import {Env} from '../../env.js';
import {FUZDLogger} from 'fuzd-common';

const logger = <FUZDLogger>logs('fuzd-server-internal-api');

function wait(seconds: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, seconds * 1000);
	});
}

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
				const transactions = await config.executor.processPendingTransactions();
				return c.json({success: true, transactions}); // TODO return processed transactons ?
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
		})
		.get('/error', async (c) => {
			throw new Error('Test error', {
				cause: {
					code: 'TEST_ERROR',
					details: {
						foo: 'bar2',
					},
				},
			});
		})
		.get('/logger-error', async (c) => {
			logger.log('will error', {
				log: {},
			});
			logger.error('error out', {
				error: {
					name: 'test',
				},
			});
			return c.json({success: true as const}, 200);
		});

	return app;
}

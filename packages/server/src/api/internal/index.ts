import {Hono} from 'hono';
import {adminAuth as createAdminAuth} from '../../admin-auth.js';
import {ServerOptions} from '../../types.js';
import {logs} from 'named-logs';
import {createErrorObject} from '../../utils/response.js';
import {setup} from '../../setup.js';
import {Env} from '../../env.js';
import {FUZDLogger} from '@fuzd/common';

const logger = <FUZDLogger>logs('fuzd-server-internal-api');

function wait(seconds: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, seconds * 1000);
	});
}

/** The actions a platform triggers periodically (its crons). */
export type InternalAction = 'processQueue' | 'processTransactions' | 'checkScheduledExecutionStatus';

export const INTERNAL_TOKEN_HEADER = 'x-fuzd-internal-token';

export function createInternalToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The internal routes do the work of the crons (broadcast due executions, resubmit transactions).
 * They accept the token of the server instance (what the platform's own crons send) or the admin
 * credentials (an operator triggering a run by hand). Open to anyone, they would let anybody start
 * runs at will: costs on a metered platform, and runs overlapping each other.
 */
export function getInternalAPI<Bindings extends Env>(options: ServerOptions<Bindings>, getInternalToken: () => string) {
	const adminAuth = createAdminAuth(options);
	const app = new Hono<{Bindings: Bindings}>()
		.use(async (c, next) => {
			if (c.req.header(INTERNAL_TOKEN_HEADER) === getInternalToken()) {
				return next();
			}
			return adminAuth(c, next);
		})
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
				const {executions, budgetExhausted} = await config.executor.processPendingTransactions();
				return c.json({success: true as const, transactions: executions, budgetExhausted}, 200);
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

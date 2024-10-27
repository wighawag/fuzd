import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {Bindings} from 'hono/types';
import {ServerOptions} from './types.js';
import {getPublicAPI} from './api/public/index.js';
import {getAdminAPI} from './api/admin/index.js';
import {getInternalAPI} from './api/internal/index.js';
import {getSchedulingAPI} from './api/scheduling/index.js';
import {getExecutionAPI} from './api/execution/index.js';
import {setup} from './setup.js';
import {getAdminDashboard} from './dashboard/admin/index.js';

export * from './storage/RemoteSQLExecutorStorage.js';
export * from './storage/RemoteSQLSchedulerStorage.js';

export function createServer<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>()
		.use(
			'*',
			cors({
				origin: '*',
				allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests', 'Content-Type', 'SIGNATURE'],
				allowMethods: ['POST', 'GET', 'HEAD', 'OPTIONS'],
				exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
				maxAge: 600,
				credentials: true,
			}),
		)
		// .use('*', async (ctx, next) => {
		// 	console.log(ctx);
		// 	await next();
		// })
		.get('/', (c) => {
			return c.text('fuzd api');
		});

	const schedulingAPI = getSchedulingAPI<Env>(options);
	const executionAPI = getExecutionAPI<Env>(options);
	const internalAPI = getInternalAPI<Env>(options);
	const publicAPI = getPublicAPI<Env>(options);
	const adminAPI = getAdminAPI<Env>(options);

	const adminDashboard = getAdminDashboard<Env>(options);

	return app
		.use('*', setup({serverOptions: options}))
		.route('/api', publicAPI)
		.route('/api/internal', internalAPI)
		.route('/api/scheduling', schedulingAPI)
		.route('/api/execution', executionAPI)
		.route('/api/admin', adminAPI)

		.route('/dashboard/admin', adminDashboard);
}

export type App = ReturnType<typeof createServer<{}>>;

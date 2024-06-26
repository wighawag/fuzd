import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {Bindings} from 'hono/types';
import {ServerOptions} from './types';
import {getPublicAPI} from './api/public';
import {getAdminAPI} from './api/admin';
import {getInternalAPI} from './api/internal';
import {getSchedulingAPI} from './api/scheduling';
import {getExecutionAPI} from './api/execution';
import {setup} from './setup';
import {getAdminDashboard} from './dashboard/admin';

export * from './storage/RemoteSQLExecutorStorage';
export * from './storage/RemoteSQLSchedulerStorage';

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

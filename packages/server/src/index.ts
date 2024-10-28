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
import swagger from './doc/swagger.json';
import {swaggerUI} from '@hono/swagger-ui';
import {hc} from 'hono/client';

export * from './storage/RemoteSQLExecutorStorage.js';
export * from './storage/RemoteSQLSchedulerStorage.js';

function createAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>().use(
		cors({
			origin: '*',
			allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests', 'Content-Type', 'SIGNATURE'],
			allowMethods: ['POST', 'GET', 'HEAD', 'OPTIONS'],
			exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
			maxAge: 600,
			credentials: true,
		}),
	);

	const home = new Hono<{Bindings: Env & {}}>()
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

	const api = new Hono<{Bindings: Env & {}}>()
		.use(setup({serverOptions: options}))
		.route('/', publicAPI)
		.route('/internal', internalAPI)
		.route('/scheduling', schedulingAPI)
		.route('/execution', executionAPI)
		.route('/admin', adminAPI);

	return app.route('/', home).route('/api', api);
}

export function createServer<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const adminDashboard = getAdminDashboard<Env>(options);
	const dashboard = new Hono<{Bindings: Env & {}}>()
		.use('*', setup({serverOptions: options}))
		.route('/admin', adminDashboard);

	return createAPI(options)
		.route('/dashboard', dashboard)
		.get('/doc', (c) => c.json(swagger))
		.get('/ui', swaggerUI({url: '/doc'}));
}

export type App = ReturnType<typeof createAPI>;

// this is a trick to calculate the type when compiling
const client = hc<App>('');
export type Client = typeof client;
export const createClient = (...args: Parameters<typeof hc>): Client => hc<App>(...args);

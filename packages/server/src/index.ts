import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {ServerOptions} from './types.js';
import {getPublicAPI} from './api/public/index.js';
import {getAdminAPI} from './api/admin/index.js';
import {getInternalAPI} from './api/internal/index.js';
import {getSchedulingAPI} from './api/scheduling/index.js';
import {getExecutionAPI} from './api/execution/index.js';
import {setup} from './setup.js';
import {getAdminDashboard} from './dashboard/admin/index.js';
import {swaggerUI} from '@hono/swagger-ui';
import {hc} from 'hono/client';
import {HTTPException} from 'hono/http-exception';
import {Env} from './env.js';

export type {Context} from 'hono';

export * from './storage/RemoteSQLExecutorStorage.js';
export * from './storage/RemoteSQLSchedulerStorage.js';

function createAppWithPublicAPIOnly<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>().use(
		cors({
			origin: '*',
			allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests', 'Content-Type', 'SIGNATURE'],
			allowMethods: ['POST', 'GET', 'HEAD', 'OPTIONS'],
			exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
			maxAge: 600,
			credentials: true,
		}),
	);

	const schedulingAPI = getSchedulingAPI(options);
	const executionAPI = getExecutionAPI(options);
	const publicAPI = getPublicAPI(options);

	const api = new Hono<{Bindings: Env & {}}>()
		.use(setup({serverOptions: options}))
		.route('/', publicAPI)
		.route('/scheduling', schedulingAPI)
		.route('/execution', executionAPI);

	return app.route('/api', api);
}

export function createDoc() {
	return new Hono()
		.get('/openapi.json', async (c) => {
			const jsonModule = await import('../doc/openapi.json', {assert: {type: 'json'}});
			return c.json(jsonModule.default, 200);
		})
		.get('/ui', swaggerUI({url: '/doc/openapi.json'}));
}

export function createServer<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const adminDashboard = getAdminDashboard<Bindings>(options);
	const dashboard = new Hono<{Bindings: Env & {}}>()
		.use(setup({serverOptions: options}))
		.route('/admin', adminDashboard);

	const internalAPI = getInternalAPI(options);
	const adminAPI = getAdminAPI(options);

	return createAppWithPublicAPIOnly(options)
		.get('/', (c) => {
			return c.text(`fuzd api : 0.7.0`); // TODO from package.json
		})
		.route('/internal', internalAPI)
		.route('/admin', adminAPI)
		.route('/dashboard', dashboard)
		.route('/doc', createDoc())
		.onError((err, c) => {
			console.error(err);
			if (err instanceof HTTPException) {
				if (err.res) {
					return err.getResponse();
				}
			}

			return c.json(
				{
					success: false,
					errors: [
						{
							name: 'name' in err ? err.name : undefined,
							code: 'code' in err ? err.code : 5000,
							status: 'status' in err ? err.status : undefined,
							message: err.message,
							// cause: err.cause,
							// stack: err.stack
						},
					],
				},
				500,
			);
		});

	// .notFound((c) => {
	// 	return c.json(
	// 		{
	// 			success: false,
	// 			errors: [
	// 				{
	// 					message: 'Not Found',
	// 				},
	// 			],
	// 		},
	// 		404,
	// 	);
	// })
}

// export type App = AddToAllOutputs<ReturnType<typeof createAPI>, ErrorType>;
export type PublicAPI = ReturnType<typeof createAppWithPublicAPIOnly>;
export type App = ReturnType<typeof createServer>;

// this is a trick to calculate the type when compiling
const client = hc<App>('');
export type Client = typeof client;
export const createClient = (...args: Parameters<typeof hc>): Client => hc<App>(...args);

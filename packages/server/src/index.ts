import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {Bindings} from 'hono/types';
import {AddToAllOutputs, ServerOptions} from './types.js';
import {getPublicAPI} from './api/public/index.js';
import {getAdminAPI} from './api/admin/index.js';
import {getInternalAPI} from './api/internal/index.js';
import {getSchedulingAPI} from './api/scheduling/index.js';
import {getExecutionAPI} from './api/execution/index.js';
import {setup} from './setup.js';
import {getAdminDashboard} from './dashboard/admin/index.js';
import {hc} from 'hono/client';
import {HTTPException} from 'hono/http-exception';

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

	return app
		.get('/', (c) => {
			return c.text('fuzd api');
		})
		.route('/api', api);
}

export function createServer<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const adminDashboard = getAdminDashboard<Env>(options);
	const dashboard = new Hono<{Bindings: Env & {}}>()
		.use(setup({serverOptions: options}))
		.route('/admin', adminDashboard);

	return createAPI(options)
		.route('/dashboard', dashboard)
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
}

type ErrorType = {
	success: false;
	errors: {name?: string; message: string; code?: number; status?: number}[];
};
export type App = AddToAllOutputs<ReturnType<typeof createAPI>, ErrorType>;

// this is a trick to calculate the type when compiling
const client = hc<App>('');
export type Client = typeof client;
export const createClient = (...args: Parameters<typeof hc>): Client => hc<App>(...args);

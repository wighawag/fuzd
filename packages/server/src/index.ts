import {logs} from 'named-logs';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {ServerOptions} from './types.js';
import {getPublicAPI} from './api/public/index.js';
import {getAdminAPI} from './api/admin/index.js';
import {getInternalAPI, createInternalToken, INTERNAL_TOKEN_HEADER, type InternalAction} from './api/internal/index.js';
import {getSchedulingAPI} from './api/scheduling/index.js';
import {getExecutionAPI} from './api/execution/index.js';
import {setup} from './setup.js';
import {getAdminDashboard} from './dashboard/admin/index.js';
import {swaggerUI} from '@hono/swagger-ui';
import {hc} from 'hono/client';
import {HTTPException} from 'hono/http-exception';
import {Env} from './env.js';
import {version} from './version.js';
import {FUZDLogger} from '@fuzd/common';
import {generateOpenAPIDocument} from './openapi.js';

export type {Context} from 'hono';

export * from './storage/RemoteSQLExecutorStorage.js';
export * from './storage/RemoteSQLSchedulerStorage.js';
export type {InternalAction} from './api/internal/index.js';

const logger = <FUZDLogger>logs('fuzd-server');

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

let openAPIDocument: ReturnType<typeof generateOpenAPIDocument> | undefined;
export function createDoc() {
	return new Hono()
		.get('/openapi.json', async (c) => {
			openAPIDocument = openAPIDocument || generateOpenAPIDocument();
			return c.json(await openAPIDocument, 200);
		})
		.get('/ui', swaggerUI({url: '/doc/openapi.json'}));
}

export function createServer<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const adminDashboard = getAdminDashboard<Bindings>(options);
	// the admin dashboard authenticates before its setup (deriving the server account costs CPU)
	const dashboard = new Hono<{Bindings: Env & {}}>().route('/admin', adminDashboard);

	// only this process knows it: the crons of the platform (cf-worker, nodejs) use it, through
	// internalRequest, to trigger the internal actions that are otherwise refused without admin credentials.
	// Generated on first use: a Worker may not generate random values in global scope, where it creates the server.
	let internalToken: string | undefined;
	const getInternalToken = () => (internalToken ??= createInternalToken());
	const internalAPI = getInternalAPI(options, getInternalToken);
	const adminAPI = getAdminAPI(options);

	const app = createAppWithPublicAPIOnly(options)
		.get('/', (c) => {
			return c.text(`fuzd api : ${version}`);
		})
		.route('/internal', internalAPI)
		.route('/admin', adminAPI)
		.route('/dashboard', dashboard)
		.route('/doc', createDoc())
		.onError((err, c) => {
			const errorObject = {
				name: 'name' in err ? err.name : undefined,
				code: 'code' in err ? (err.code as number) : 5000,
				status: 'status' in err ? err.status : undefined,
				message: err.message,
				// cause: err.cause,
				// stack: err.stack
			};

			logger.error(errorObject.message, {
				error: {
					name: errorObject.name,
					cause: err.cause,
					stack: err.stack,
					code: errorObject.code,
					status: errorObject.status,
				},
			});
			if (err instanceof HTTPException) {
				if (err.res) {
					return err.getResponse();
				}
			}

			return c.json(
				{
					success: false,
					errors: [errorObject],
				},
				500,
			);
		});

	return Object.assign(app, {
		/** A request for an internal action (processQueue, ...), authenticated for this server only. */
		internalRequest(action: InternalAction): Request {
			return new Request(`http://localhost/internal/${action}`, {
				headers: {[INTERNAL_TOKEN_HEADER]: getInternalToken()},
			});
		},
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

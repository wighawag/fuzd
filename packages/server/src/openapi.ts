import {Hono} from 'hono';
import {generateSpecs} from 'hono-openapi';
import {getPublicAPI} from './api/public/index.js';
import {getSchedulingAPI} from './api/scheduling/index.js';
import {getExecutionAPI} from './api/execution/index.js';
import {ServerOptions} from './types.js';

// The document only needs the route definitions (paths, validators, descriptions), never the
// handlers, so the options are never called while generating it.
const noOptions: ServerOptions<any> = {
	getDB() {
		throw new Error(`not available while generating the OpenAPI document`);
	},
	getEnv() {
		throw new Error(`not available while generating the OpenAPI document`);
	},
};

/**
 * The public API (the same routes as `PublicAPI`), described from the same zod schemas that validate it.
 */
export type OpenAPIDocument = {openapi: string; paths: Record<string, unknown>; [key: string]: unknown};

export async function generateOpenAPIDocument(): Promise<OpenAPIDocument> {
	const api = new Hono()
		.route('/', getPublicAPI(noOptions))
		.route('/scheduling', getSchedulingAPI(noOptions))
		.route('/execution', getExecutionAPI(noOptions));
	const app = new Hono().route('/api', api);
	return generateSpecs(app, {
		documentation: {
			openapi: '3.1.0',
			info: {title: 'fuzd-server', version: 'api', description: 'API'},
		},
	});
}

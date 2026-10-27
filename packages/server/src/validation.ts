import type {ValidationTargets} from 'hono';
import {describeRoute, resolver, validator} from 'hono-openapi';
import type {StandardSchemaV1} from '@standard-schema/spec';
import {ErrorResponseSchema} from './schemas/index.js';
import type {ErrorType} from './utils/response.js';

/**
 * Validate (and normalise) one request target with a schema from `./schemas`.
 * On failure the request is answered with a 400 carrying the usual `ErrorType` body.
 */
export function validate<Schema extends StandardSchemaV1, Target extends keyof ValidationTargets>(
	target: Target,
	schema: Schema,
) {
	return validator(target, schema, (result, c) => {
		if (!result.success) {
			const error: ErrorType = {
				success: false,
				errors: result.error.map((issue) => ({
					name: 'ValidationError',
					code: 4000,
					status: 400,
					message: `invalid ${target}${issue.path && issue.path.length > 0 ? ` at ${issue.path.map((p) => (typeof p === 'object' ? p.key : p)).join('.')}` : ''}: ${issue.message}`,
				})),
			};
			return c.json(error, 400);
		}
	});
}

/** OpenAPI description of a route: its 200 body plus the shared 400/500 error body. */
export function describe(options: {description?: string; response: StandardSchemaV1; validated?: boolean}) {
	return describeRoute({
		description: options.description,
		responses: {
			200: {
				description: 'success',
				content: {'application/json': {schema: resolver(options.response)}},
			},
			...(options.validated === false
				? {}
				: {
						400: {
							description: 'invalid request',
							content: {'application/json': {schema: resolver(ErrorResponseSchema)}},
						},
					}),
			500: {
				description: 'error',
				content: {'application/json': {schema: resolver(ErrorResponseSchema)}},
			},
		},
	});
}

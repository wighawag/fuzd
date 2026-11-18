import type {MiddlewareHandler} from 'hono';
import {basicAuth} from 'hono/basic-auth';
import type {ServerOptions} from './types.js';
import type {Env} from './env.js';

/**
 * HTTP Basic auth for the operator: user `admin`, password TOKEN_ADMIN. A browser shows its native
 * login dialog on the 401 and remembers the credentials, so the dashboard needs no token in its UI.
 * Without TOKEN_ADMIN everything is refused.
 *
 * The env is read through `getEnv`: on node (the `fuzd` CLI) `c.env` is not the env.
 */
export function adminAuth<Bindings extends Env>(options: ServerOptions<Bindings>): MiddlewareHandler {
	return basicAuth({
		realm: 'fuzd admin',
		verifyUser: (username, password, c) => {
			const tokenAdmin = (options.getEnv(c as any) as Env).TOKEN_ADMIN;
			return !!tokenAdmin && username === 'admin' && password === tokenAdmin;
		},
	});
}

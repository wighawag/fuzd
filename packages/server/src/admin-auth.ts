import type {MiddlewareHandler} from 'hono';
import {basicAuth} from 'hono/basic-auth';
import type {ServerOptions} from './types.js';
import type {Env} from './env.js';
import {safeEqual} from './utils/safe-equal.js';

/**
 * HTTP Basic auth for the operator: user `admin`, password TOKEN_ADMIN. A browser shows its native
 * login dialog on the 401 and remembers the credentials, so the dashboard needs no token in its UI.
 * Without TOKEN_ADMIN everything is refused. The credentials are compared in constant time.
 *
 * The env is read through `getEnv`: on node (the `fuzd` CLI) `c.env` is not the env.
 */
export function adminAuth<Bindings extends Env>(options: ServerOptions<Bindings>): MiddlewareHandler {
	return basicAuth({
		realm: 'fuzd admin',
		verifyUser: async (username, password, c) => {
			const tokenAdmin = (options.getEnv(c as any) as Env).TOKEN_ADMIN;
			if (!tokenAdmin) {
				return false;
			}
			// both compared, in constant time: neither tells which one was wrong, nor how close it was
			const [userMatches, passwordMatches] = await Promise.all([
				safeEqual(username, 'admin'),
				safeEqual(password, tokenAdmin),
			]);
			return userMatches && passwordMatches;
		},
	});
}

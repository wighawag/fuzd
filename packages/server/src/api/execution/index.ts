import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

export function getExecutionAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>();
	return app;
}

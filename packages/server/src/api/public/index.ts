import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

export function getPublicAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const {getDB} = options;

	const app = new Hono<{Bindings: Env & {}}>()
		.get('/publicKey', async () => {})
		.get('/time/:chainId', async () => {})
		.get('/contractTimestamp', async () => {});

	return app;
}

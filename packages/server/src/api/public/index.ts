import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';

export function getPublicAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const {getDB} = options;

	const app = new Hono<{Bindings: Env & {}}>()
		.get('/publicKey', async (c) => {
			const config = c.get('config');
			return c.text(config.account.publicExtendedKey);
		})
		.get('/time/:chainId', async () => {})
		.get('/contractTimestamp', async () => {});

	return app;
}

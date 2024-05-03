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
		.get('/time/:chainId', async (c) => {
			const config = c.get('config');
			const chainId = c.req.param('chainId');
			const {provider} =
				config.chainConfigs[
					(chainId.startsWith('0x') ? chainId : `0x${parseInt(chainId).toString(16)}`) as `0x${string}`
				];
			const timestamp = await config.time.getTimestamp(provider);
			return c.json({timestamp});
		})
		.get('/contractTimestamp', async (c) => {
			const config = c.get('config');
			const address = config.contractTimestampAddress;
			return c.json({timeContract: address});
		});

	return app;
}

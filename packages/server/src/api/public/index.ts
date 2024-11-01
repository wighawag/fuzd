import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';

export function getPublicAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const {getDB} = options;

	const app = new Hono<{Bindings: Env & {}}>()
		.get('/publicKey', async (c) => {
			const config = c.get('config');
			return c.json({success: true, publicKey: config.account.publicExtendedKey});
		})
		.get('/paymentAccountBroadcaster', async (c) => {
			const config = c.get('config');
			return c.json({
				success: true,
				paymentAccountBroadcaster: config.paymentAccount
					? config.account.deriveForAddress(config.paymentAccount)
					: null,
			});
		})
		.get('/time/:chainId', async (c) => {
			const config = c.get('config');
			const chainId = c.req.param('chainId');
			const chainProtocol =
				config.chainProtocols[
					(chainId.startsWith('0x') ? chainId : `0x${parseInt(chainId).toString(16)}`) as `0x${string}`
				];
			const timestamp = await chainProtocol.getTimestamp();
			return c.json({success: true, timestamp});
		})
		.get('/contractTimestamp', async (c) => {
			const config = c.get('config');
			const address = config.contractTimestampAddress;
			return c.json({success: true, timeContract: address});
		});

	return app;
}

import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {createErrorObject} from '../../utils/response.js';
import {String0x} from 'fuzd-common';
import {Env} from '../../env.js';

export function getPublicAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.get('/publicKey', async (c) => {
			try {
				const config = c.get('config');

				return c.json({success: true as const, publicKey: config.account.publicExtendedKey}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/time/:chainId', async (c) => {
			try {
				const config = c.get('config');
				const chainId = c.req.param('chainId');
				const chainProtocol =
					config.chainProtocols[
						(chainId.startsWith('0x') ? chainId : `0x${parseInt(chainId).toString(16)}`) as String0x
					];
				if (!chainProtocol) {
					throw new Error(`cannot get protocol for chain with id ${chainId}`);
				}
				const timestamp = await chainProtocol.getTimestamp();
				return c.json({success: true as const, timestamp}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/contractTimestamp', async (c) => {
			try {
				const config = c.get('config');
				const address = config.contractTimestampAddress;
				return c.json({success: true as const, timeContract: address}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	return app;
}

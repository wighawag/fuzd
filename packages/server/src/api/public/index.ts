import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {createErrorObject} from '../../utils/response.js';
import {String0x} from 'fuzd-common';

export function getPublicAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const {getDB} = options;

	const app = new Hono<{Bindings: Env & {}}>()
		.get('/publicKey', async (c) => {
			try {
				const config = c.get('config');

				return c.json({success: true as const, publicKey: config.account.publicExtendedKey}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/paymentAccountBroadcaster', async (c) => {
			try {
				const config = c.get('config');

				return c.json(
					{
						success: true as const,
						paymentAccountBroadcaster: config.paymentAccount
							? config.account.deriveForAddress(config.paymentAccount)
							: null,
					},
					200,
				);
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

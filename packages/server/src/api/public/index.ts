import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {createErrorObject} from '../../utils/response.js';
import {Env} from '../../env.js';
import {z} from 'zod';
import {describe, validate} from '../../validation.js';
import {ChainIdParamSchema, String0xSchema, successResponse} from '../../schemas/index.js';

export function getPublicAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const app = new Hono<{Bindings: Bindings}>()
		.get('/publicKey', describe({response: successResponse({publicKey: z.string()}), validated: false}), async (c) => {
			try {
				const config = c.get('config');

				return c.json({success: true as const, publicKey: config.account.publicExtendedKey}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get(
			'/time/:chainId',
			describe({response: successResponse({timestamp: z.number()})}),
			validate('param', ChainIdParamSchema),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId} = c.req.valid('param');

					const chainProtocol = config.chainProtocols[chainId];
					if (!chainProtocol) {
						throw new Error(`cannot get protocol for chain with id ${chainId}`);
					}
					const timestamp = await chainProtocol.getTimestamp();
					return c.json({success: true as const, timestamp}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)
		.get(
			'/contractTimestamp',
			describe({response: successResponse({timeContract: String0xSchema.optional()}), validated: false}),
			async (c) => {
				try {
					const config = c.get('config');
					const address = config.contractTimestampAddress;
					return c.json({success: true as const, timeContract: address}, 200);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		);

	return app;
}

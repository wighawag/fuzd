import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {assert} from 'typia';
import {createErrorObject} from '../../utils/response.js';
import {String0x} from 'fuzd-common';

export function getExecutionAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>().get('/remoteAccount/:chainId/:account', async (c) => {
		try {
			const config = c.get('config');
			const chainId = assert<String0x>(c.req.param('chainId'));
			const account = assert<String0x>(c.req.param('account'));
			const broadcasterInfo = await config.executor.getRemoteAccount(chainId, account);
			return c.json({success: true as const, account: broadcasterInfo}, 200);
		} catch (err) {
			return c.json(createErrorObject(err), 500);
		}
	});
	return app;
}

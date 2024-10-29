import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types.js';
import {assert} from 'typia';

export function getExecutionAPI<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const app = new Hono<{Bindings: Env & {}}>().get('/remote-account/:chainId/:account', async (c) => {
		const config = c.get('config');
		const chainId = assert<`0x${string}`>(c.req.param('chainId'));
		const account = assert<`0x${string}`>(c.req.param('account'));
		const broadcasterInfo = await config.executor.getRemoteAccount(chainId, account);
		return c.json({success: true, account: broadcasterInfo});
	});
	return app;
}

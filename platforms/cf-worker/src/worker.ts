import {createServer} from 'fuzd-server';
import {RemoteD1} from 'remote-sql-d1';

type Env = {
	DB: D1Database;
	ROOMS: DurableObjectNamespace;
};

export const app = createServer<Env>({
	getDB: (c) => new RemoteD1(c.env.DB),
});

export default {
	fetch: app.fetch,
	// @ts-expect-error TS6133
	async scheduled(event, env, ctx) {
		ctx.waitUntil(() => {
			console.log(`scheduled`);
		});
	},
};

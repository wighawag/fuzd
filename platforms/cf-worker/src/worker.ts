import {createServer} from 'fuzd-server';
import {RemoteD1} from 'remote-sql-d1';
import {wrapWithLogger} from './utils/logflare';
import {Env} from './env';

export const app = createServer<Env>({
	getDB: (c) => new RemoteD1(c.env.DB),
});

const fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(request, env, ctx, async () => app.fetch(request, env, ctx));
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(new Request(`https://scheduler.fuzd.dev/${event.cron}`), env, ctx, async () => {
		if (event.cron === '* * * * *') {
			return app.fetch(new Request('http://localhost/processQueue'), env, ctx);
		} else if (event.cron === '*/1 * * * *') {
			return app.fetch(new Request('http://localhost/processTransactions'), env, ctx);
		} else {
			return new Response(`invalid CRON`, {
				status: 500,
			});
		}
	});
};

export default {
	fetch,
	scheduled,
};

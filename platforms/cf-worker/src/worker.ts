import 'named-logs-context';
import {createServer} from 'fuzd-server';
import {RemoteD1} from 'remote-sql-d1';
import {Env} from './env.js';
import {logs} from 'named-logs';
import {track, enable as enableWorkersLogger} from 'workers-logger';
import {ExecutionContext} from '@cloudflare/workers-types/experimental';
import {wrapWithLogger} from './logging/index.js';
enableWorkersLogger('*');
const logger = logs('worker');

export const app = createServer<Env>({
	getDB: (c) => new RemoteD1(c.env.DB),
	getEnv: (c) => c.env,
});

const fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
	return wrapWithLogger(request, env, ctx, async () => {
		return app.fetch(request, env, ctx);
	});
};

const cronInternalActions: Record<string, string> = {
	'* * * * *': 'processQueue',
	'*/1 * * * *': 'processTransactions',
	'*/2 * * * *': 'checkScheduledExecutionStatus',
};

const scheduled = async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
	if (env.DISABLE_CRON) {
		return new Response(`CRON ARE DISABLED`, {
			status: 200,
		});
	}
	const action = cronInternalActions[event.cron];
	return wrapWithLogger(new Request(`https://scheduler.fuzd.dev/${action || event.cron}`), env, ctx, async () => {
		if (action) {
			return app.fetch(new Request(`http://localhost/internal/${action}`), env, ctx);
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

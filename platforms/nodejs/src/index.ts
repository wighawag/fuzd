import 'named-logs-context';
import {createServer} from 'fuzd-server';
import {serve} from '@hono/node-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';

type Env = {
	DB: string;
};

export const app = createServer<Env>({
	getDB: (c) => {
		const client = createClient({
			url: c.env.DB, // ':memory:'
		});
		return new RemoteLibSQL(client);
	},
	getEnv: (c) => c.env,
});

const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port,
});

import 'named-logs-context';
import {createServer} from 'fuzd-server';
import {serve} from '@hono/node-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

type Env = {
	DB: string;
};
const env = process.env as Env;

const args = process.argv.slice(2);
const sqlFolder = args[0]; // packages/server/src/schema/sql

const client = createClient({
	url: env.DB,
});
const remoteSQL = new RemoteLibSQL(client);

if (sqlFolder) {
	console.log(`executing sql...`);
	const executorSQL = fs.readFileSync(path.join(sqlFolder, 'executor.sql'), 'utf8');
	const schedulerSQL = fs.readFileSync(path.join(sqlFolder, 'scheduler.sql'), 'utf8');
	await client.executeMultiple(executorSQL + schedulerSQL);
	console.log(`done`);
}

export const app = createServer<Env>({
	getDB: (c) => remoteSQL,
	getEnv: (c) => env,
});

const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port,
});

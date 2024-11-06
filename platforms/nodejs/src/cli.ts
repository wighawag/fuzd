#!/usr/bin/env node
import 'named-logs-context';
import {createServer} from 'fuzd-server';
import {serve} from '@hono/node-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import {Command} from 'commander';
import {loadEnv} from 'ldenv';

const __dirname = import.meta.dirname;

loadEnv({
	defaultEnvFile: path.join(__dirname, '../.env.default'),
});

type Env = {
	DB: string;
};

async function main() {
	const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
	const program = new Command();

	program
		.name('fuzd-nodejs')
		.version(pkg.version)
		.usage(`fuzd-nodejs [--port 34002] [--sql <sql-folder>]`)
		.description('run fuzd-server as a node process')
		.option('-p, --port <port>')
		.option(
			'-i, --process-interval <interval>',
			'number of seconds between each processQueue/. set it to zero to cancel it',
		);

	program.parse(process.argv);

	type Options = {
		port?: string;
		processInterval?: string;
	};

	const options: Options = program.opts();
	const port = options.port ? parseInt(options.port) : 3000;
	const processInterval = options.processInterval ? parseInt(options.processInterval) : 1;

	const env = process.env as Env;

	const db = env.DB;
	const TOKEN_ADMIN = (env as any).TOKEN_ADMIN;

	const client = createClient({
		url: db,
	});
	const remoteSQL = new RemoteLibSQL(client);

	const app = createServer<Env>({
		getDB: (c) => remoteSQL,
		getEnv: (c) => env,
	});

	if (db === ':memory:') {
		console.log(`executing setup...`);
		await app.fetch(
			new Request('http://localhost/admin/setup', {
				headers: {
					Authorization: `Basic ${btoa(`admin:${TOKEN_ADMIN}`)}`,
				},
			}),
		);
	}

	function processQueueAndTransactions() {
		app.fetch(new Request('http://localhost/internal/processQueue'));
		app.fetch(new Request('http://localhost/internal/processTransactions'));
		app.fetch(new Request('http://localhost/internal/checkScheduledExecutionStatus'));
	}

	let runningInterval;
	if (processInterval > 0) {
		runningInterval = setInterval(processQueueAndTransactions, processInterval * 1000);
	}

	serve({
		fetch: app.fetch,
		port,
	});

	console.log(`Server is running on http://localhost:${port}`);
}
main();

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
		.option('-p, --port <port>');

	program.parse(process.argv);

	type Options = {
		port?: string;
	};

	const {port}: Options = program.opts();

	const env = process.env as Env;

	const db = env.DB;

	const client = createClient({
		url: db,
	});
	const remoteSQL = new RemoteLibSQL(client);

	if (db === ':memory:') {
		console.log(`execution sql to initialise database...`);
		const sql = path.join(`${__dirname}`, '../node_modules/fuzd-server/src/schema/sql');
		const executorSQL = fs.readFileSync(path.join(sql, 'executor.sql'), 'utf8');
		const schedulerSQL = fs.readFileSync(path.join(sql, 'scheduler.sql'), 'utf8');
		await client.executeMultiple(executorSQL + schedulerSQL);
	}

	const app = createServer<Env>({
		getDB: (c) => remoteSQL,
		getEnv: (c) => env,
	});

	const portToUse = port ? parseInt(port) : 3000;

	console.log(`Server is running on http://localhost:${portToUse}`);

	serve({
		fetch: app.fetch,
		port: portToUse,
	});
}
main();

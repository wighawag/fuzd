#!/usr/bin/env node
import 'named-logs-context';
import {createServer} from '@fuzd/server';
import {serve} from '@hono/node-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import {Command, InvalidArgumentError} from 'commander';
import {loadEnv} from 'ldenv';

const __dirname = import.meta.dirname;

// the env (and `.env` files) still configure everything; a flag overrides its variable
loadEnv({
	defaultEnvFile: path.join(__dirname, '../.env.default'),
});

type Env = Record<string, string | undefined> & {
	DB: string;
};

/** `<chainId>=<rpc>`, the rpc keeping its `#finality=..&worstCaseBlockTime=..&protocol=..` suffix. */
function parseChain(value: string, previous: Record<string, string> = {}): Record<string, string> {
	const separator = value.indexOf('=');
	const chainId = separator > 0 ? value.slice(0, separator) : '';
	const rpc = separator > 0 ? value.slice(separator + 1) : '';
	if (!/^[0-9]+$/.test(chainId) || !rpc) {
		throw new InvalidArgumentError(`expected <chainId>=<rpc>, e.g. 31337=http://127.0.0.1:8555, got "${value}"`);
	}
	return {...previous, [chainId]: rpc};
}

function parseBoolean(value: string): 'true' | 'false' {
	if (value !== 'true' && value !== 'false') {
		throw new InvalidArgumentError(`expected true or false, got "${value}"`);
	}
	return value;
}

async function main() {
	const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
	const program = new Command();

	program
		.name('fuzd')
		.version(pkg.version)
		.usage(`[--port 3000] [--db :memory:] --chain <chainId>=<rpc> [--chain ...] --mnemonic <mnemonic>`)
		.description(
			'run fuzd-server as a node process. Every option falls back to its environment variable (in brackets), which `.env` files may set.',
		)
		.option('-p, --port <port>', 'port to listen on', '3000')
		.option('-d, --db <url>', 'libsql database url, or :memory: (which runs the setup at start) [DB]')
		.option(
			'-c, --chain <chainId=rpc>',
			'a chain to serve, repeatable: <chainId>=<rpc>, with an optional #finality=<blocks>&worstCaseBlockTime=<seconds>&protocol=<ethereum|starknet> suffix [CHAIN_<chainId>]',
			parseChain,
		)
		.option('-m, --mnemonic <mnemonic>', 'mnemonic the remote accounts are derived from [HD_MNEMONIC]')
		.option('--admin-token <token>', 'password of the admin routes (user "admin") [TOKEN_ADMIN]')
		.option(
			'--time-lock-decryption <true|false>',
			'decrypt time-locked executions with drand (mainnet) [TIME_LOCK_DECRYPTION, default true]',
			parseBoolean,
		)
		.option(
			'--payment-account <address>',
			'account whose remote account covers a gas price above what an execution authorised [PAYMENT_ACCOUNT]',
		)
		.option(
			'--contract-timestamp <address>',
			'contract the chain time is read from, instead of the latest block [CONTRACT_TIMESTAMP]',
		)
		.option('--dev', 'enable the development routes, like /admin/setChainOverride [DEV=true]')
		.option(
			'-i, --process-interval <seconds>',
			'seconds between each processQueue/processTransactions/checkScheduledExecutionStatus, 0 to disable',
			'1',
		);

	program.parse(process.argv);

	type Options = {
		port: string;
		db?: string;
		chain?: Record<string, string>;
		mnemonic?: string;
		adminToken?: string;
		timeLockDecryption?: 'true' | 'false';
		paymentAccount?: string;
		contractTimestamp?: string;
		dev?: boolean;
		processInterval: string;
	};

	const options: Options = program.opts();
	const port = parseInt(options.port);
	const processInterval = parseInt(options.processInterval);
	if (isNaN(port) || isNaN(processInterval)) {
		program.error(`--port and --process-interval take a number`);
	}

	const fromFlags: Record<string, string | undefined> = {
		DB: options.db,
		HD_MNEMONIC: options.mnemonic,
		TOKEN_ADMIN: options.adminToken,
		TIME_LOCK_DECRYPTION: options.timeLockDecryption,
		PAYMENT_ACCOUNT: options.paymentAccount,
		CONTRACT_TIMESTAMP: options.contractTimestamp,
		DEV: options.dev ? 'true' : undefined,
	};
	for (const [chainId, rpc] of Object.entries(options.chain || {})) {
		fromFlags[`CHAIN_${chainId}`] = rpc;
	}
	const env: Env = {DB: ':memory:', ...process.env};
	for (const [key, value] of Object.entries(fromFlags)) {
		if (value !== undefined) {
			env[key] = value;
		}
	}

	const dbURL = env.DB;
	const client = createClient({
		url: dbURL,
	});
	const remoteSQL = new RemoteLibSQL(client);

	const app = createServer<Env>({
		getDB: (c) => remoteSQL,
		getEnv: (c) => env,
	});

	if (dbURL === ':memory:') {
		if (!env.TOKEN_ADMIN) {
			// the setup goes through the admin route; with no token given, nobody else can use it
			env.TOKEN_ADMIN = crypto.randomUUID();
		}
		console.log(`executing setup...`);
		const response = await app.fetch(
			new Request('http://localhost/admin/setup', {
				headers: {
					Authorization: `Basic ${btoa(`admin:${env.TOKEN_ADMIN}`)}`,
				},
			}),
		);
		if (!response.ok) {
			console.error(`setup failed (${response.status}): ${await response.text()}`);
			process.exit(1);
		}
	}

	function processQueueAndTransactions() {
		app.fetch(new Request('http://localhost/internal/processQueue'));
		app.fetch(new Request('http://localhost/internal/processTransactions'));
		app.fetch(new Request('http://localhost/internal/checkScheduledExecutionStatus'));
	}

	if (processInterval > 0) {
		setInterval(processQueueAndTransactions, processInterval * 1000);
	}

	serve({
		fetch: app.fetch,
		port,
	});

	const chains = Object.keys(env)
		.filter((v) => v.startsWith('CHAIN_'))
		.map((v) => v.slice(6));
	console.log(
		`Server is running on http://localhost:${port} (db: ${dbURL}, chains: ${chains.length ? chains.join(', ') : 'none'})`,
	);
}
main();

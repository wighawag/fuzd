/**
 * Spawns the built CLI the way another project's local loop does: on a free port, on `:memory:`,
 * with its chain and mnemonic given as flags and no env file of its own (it runs from a scratch
 * directory, so a developer's `.env` here is never read).
 */
import {spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';

const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageDir, 'dist', 'cli.js');
const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'));
const serverPkg = JSON.parse(
	fs.readFileSync(path.join(packageDir, 'node_modules', '@fuzd', 'server', 'package.json'), 'utf-8'),
);

const MNEMONIC_A = 'test test test test test test test test test test test junk';
const MNEMONIC_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const ACCOUNT = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a';
const CHAIN_ID = '31337';

/** A port nothing listens on right now: the OS picks it, and it is released before use. */
async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const {port} = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

// the env a spawned CLI starts from: this process's, without anything that configures fuzd
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (
			!key.startsWith('CHAIN_') &&
			!['DB', 'HD_MNEMONIC', 'TOKEN_ADMIN', 'TIME_LOCK_DECRYPTION', 'PAYMENT_ACCOUNT', 'CONTRACT_TIMESTAMP'].includes(
				key,
			)
		) {
			env[key] = value;
		}
	}
	return {...env, ...extra};
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzd-cli-'));
let rpc: string; // a chain RPC nothing answers: these routes never reach it
let running: {child: ChildProcess; base: string} | undefined;

async function start(args: string[], env: Record<string, string> = {}) {
	const port = await freePort();
	const child = spawn('node', [cli, '--port', String(port), '--process-interval', '0', ...args], {
		cwd: scratch,
		env: cleanEnv(env),
		stdio: 'ignore',
		detached: true, // its own process group, stopped as a whole
	});
	running = {child, base: `http://127.0.0.1:${port}`};
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`the CLI exited with ${child.exitCode}`);
		}
		try {
			const response = await request('/', 1000);
			await response.arrayBuffer();
			return running;
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	throw new Error('the CLI did not start');
}

async function stop() {
	if (!running) return;
	const {child} = running;
	running = undefined;
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise((r) => child.once('exit', r));
	process.kill(-child.pid!, 'SIGTERM');
	await exited;
}

async function request(pathname: string, timeoutMs = 5000) {
	return fetch(`${running!.base}${pathname}`, {
		headers: {connection: 'close'},
		signal: AbortSignal.timeout(timeoutMs),
	});
}

async function remoteAccount(chainId = CHAIN_ID) {
	const response = await request(`/api/execution/remoteAccount/${chainId}/${ACCOUNT}`);
	return (await response.json()) as any;
}

beforeAll(async () => {
	expect(fs.existsSync(cli), `${cli} is missing, run \`pnpm build\` first`).toBe(true);
	rpc = `http://127.0.0.1:${await freePort()}`;
});
afterEach(stop);
afterAll(() => {
	fs.rmSync(scratch, {recursive: true, force: true});
});

describe('the fuzd CLI', () => {
	it('serves its version and a remote account from flags alone, on :memory:', async () => {
		await start([
			'--db',
			':memory:',
			'--chain',
			`${CHAIN_ID}=${rpc}#finality=1&worstCaseBlockTime=2`,
			'--mnemonic',
			MNEMONIC_A,
		]);

		const version = await request('/');
		expect(version.status).toBe(200);
		expect(await version.text()).toBe(`fuzd api : ${serverPkg.version}`);

		const json = await remoteAccount();
		expect(json.success).toBe(true);
		expect(json.account.address).toMatch(/^0x[0-9a-f]{40}$/);
		expect(json.account.serviceParameters).toBeDefined();
	});

	it('defaults to :memory: and configures no chain unless asked', async () => {
		await start(['--mnemonic', MNEMONIC_A]);
		const json = await remoteAccount();
		expect(json.success).toBe(false);
	});

	it('takes a flag over the env, and the env still works', async () => {
		const chain = `${rpc}#finality=1&worstCaseBlockTime=2`;

		await start(['--chain', `${CHAIN_ID}=${chain}`, '--mnemonic', MNEMONIC_A]);
		const fromFlags = (await remoteAccount()).account.address;
		await stop();

		await start([], {DB: ':memory:', [`CHAIN_${CHAIN_ID}`]: chain, HD_MNEMONIC: MNEMONIC_B});
		const fromEnv = (await remoteAccount()).account.address;
		await stop();

		await start(['--mnemonic', MNEMONIC_A], {[`CHAIN_${CHAIN_ID}`]: chain, HD_MNEMONIC: MNEMONIC_B});
		const flagOverEnv = (await remoteAccount()).account.address;

		expect(fromEnv).not.toEqual(fromFlags);
		expect(flagOverEnv).toEqual(fromFlags);
	}, 60000);

	it('serves several chains, one --chain each', async () => {
		await start([
			'--chain',
			`${CHAIN_ID}=${rpc}`,
			'--chain',
			`8453=${rpc}#finality=12&worstCaseBlockTime=15`,
			'--mnemonic',
			MNEMONIC_A,
		]);
		expect((await remoteAccount(CHAIN_ID)).success).toBe(true);
		expect((await remoteAccount('8453')).success).toBe(true);
		expect((await remoteAccount('1')).success).toBe(false);
	});

	it('runs the setup with the admin token it was given', async () => {
		await start(['--chain', `${CHAIN_ID}=${rpc}`, '--mnemonic', MNEMONIC_A, '--admin-token', 'a-token']);
		const unauthorized = await request('/admin/setup');
		expect(unauthorized.status).toBe(401);
		const authorized = await fetch(`${running!.base}/admin/setup`, {
			headers: {connection: 'close', Authorization: `Basic ${btoa('admin:a-token')}`},
		});
		expect((await authorized.json()) as any).toMatchObject({success: true});
	});

	it('refuses a malformed --chain', async () => {
		await expect(start(['--chain', 'no-equal-sign', '--mnemonic', MNEMONIC_A])).rejects.toThrow(/exited/);
	});

	it('prints its own version', async () => {
		const child = spawn('node', [cli, '--version'], {cwd: scratch, env: cleanEnv()});
		let out = '';
		child.stdout.on('data', (d) => (out += d));
		await new Promise((r) => child.once('exit', r));
		expect(out.trim()).toBe(pkg.version);
	});
});

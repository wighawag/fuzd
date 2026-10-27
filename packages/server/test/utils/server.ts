import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {keccak256} from 'viem';
import type {PrivateKeyAccount} from 'viem/accounts';
import {createServer} from '../../src/index.js';

export const CHAIN_ID = '31337';
const RPC_URL = 'http://fuzd-test-rpc.invalid/';
export const TOKEN_ADMIN = 'test-admin-token';

/**
 * A minimal JSON-RPC node, answering only what the server asks while scheduling and broadcasting.
 * The test never reaches the network: requests to RPC_URL are answered here, anything else fails.
 */
function mockRPC(method: string, params: any[]): unknown {
	const now = Math.floor(Date.now() / 1000);
	switch (method) {
		case 'eth_chainId':
			return '0x7a69';
		case 'eth_blockNumber':
			return '0x10';
		case 'eth_getBlockByNumber':
			return {number: '0x10', timestamp: `0x${now.toString(16)}`, baseFeePerGas: '0x1', hash: `0x${'11'.repeat(32)}`};
		case 'eth_feeHistory':
			return {oldestBlock: '0x1', baseFeePerGas: ['0x1', '0x1'], gasUsedRatio: [0.5], reward: [['0x1', '0x1', '0x1']]};
		case 'eth_gasPrice':
		case 'eth_maxPriorityFeePerGas':
			return '0x1';
		case 'eth_getTransactionCount':
			return '0x0';
		case 'eth_getBalance':
			return '0x56bc75e2d63100000'; // 100 ether
		case 'eth_estimateGas':
			return '0x5208';
		case 'eth_sendRawTransaction':
			return keccak256(params[0]);
		case 'eth_getTransactionReceipt':
		case 'eth_getTransactionByHash':
			return null;
	}
	throw new Error(`mock RPC: unexpected method ${method}`);
}

const realFetch = globalThis.fetch;
function installMockRPC() {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (!url.startsWith(RPC_URL)) {
			throw new Error(`test: unexpected network access to ${url}`);
		}
		const body = JSON.parse(
			typeof input === 'object' && 'text' in input && !init?.body ? await input.text() : (init?.body as string),
		);
		const answer = (request: {id: number; method: string; params?: any[]}) => {
			try {
				return {jsonrpc: '2.0', id: request.id, result: mockRPC(request.method, request.params || [])};
			} catch (err: any) {
				return {jsonrpc: '2.0', id: request.id, error: {code: -32601, message: err.message}};
			}
		};
		const result = Array.isArray(body) ? body.map(answer) : answer(body);
		return new Response(JSON.stringify(result), {headers: {'content-type': 'application/json'}});
	}) as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
}

export type TestServer = Awaited<ReturnType<typeof createTestServer>>;

export async function createTestServer() {
	// the database lives in a scratch dir, never in a shared location
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzd-server-test-'));
	const client = createClient({url: `file:${path.join(dir, 'db.sqlite')}`});
	const db = new RemoteLibSQL(client);
	const env = {
		HD_MNEMONIC: 'test test test test test test test test test test test junk',
		[`CHAIN_${CHAIN_ID}`]: `${RPC_URL}#finality=1&worstCaseBlockTime=2`,
		TIME_LOCK_DECRYPTION: 'false',
		TOKEN_ADMIN,
	} as const;
	const app = createServer<any>({getDB: () => db, getEnv: () => env});
	const uninstallMockRPC = installMockRPC();

	async function request(pathname: string, init?: RequestInit) {
		return app.fetch(new Request(`http://localhost${pathname}`, init));
	}
	async function getJSON(pathname: string, init?: RequestInit) {
		const response = await request(pathname, init);
		return {status: response.status, json: (await response.json()) as any};
	}
	async function postSigned(pathname: string, wallet: PrivateKeyAccount, data: unknown) {
		const body = JSON.stringify(data);
		const signature = await wallet.signMessage({message: body});
		return getJSON(pathname, {
			method: 'POST',
			body,
			headers: {'content-type': 'application/json', signature},
		});
	}
	const adminHeaders = {Authorization: `Basic ${btoa(`admin:${TOKEN_ADMIN}`)}`};

	const setup = await getJSON('/admin/setup', {headers: adminHeaders});
	if (!setup.json.success) {
		throw new Error(`setup failed: ${JSON.stringify(setup.json)}`);
	}

	return {
		app,
		db: client,
		request,
		getJSON,
		postSigned,
		adminHeaders,
		close() {
			uninstallMockRPC();
			client.close();
			fs.rmSync(dir, {recursive: true, force: true});
		},
	};
}

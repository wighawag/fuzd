import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {keccak256} from 'viem';
import type {PrivateKeyAccount} from 'viem/accounts';
import type {HttpChainClient} from 'tlock-js';
import {createServer} from '../../src/index.js';

export const CHAIN_ID = '31337';
const RPC_URL = 'http://fuzd-test-rpc.invalid/';
export const TOKEN_ADMIN = 'test-admin-token';

const LATEST_BLOCK = 0x10;
const MINED_BLOCK = 0x5; // final with finality=1: 5 <= 16 - 1
const MINED_BLOCK_HASH = `0x${'55'.repeat(32)}`;

/**
 * What a test can steer or observe on the mock node: balances per address (lowercase; 100 ether
 * otherwise), every method called, in order, the chain's clock (moved forward with `timeOffset`, in
 * seconds) and the transactions mined (by hash). Until a transaction is mined it has no receipt.
 */
export type MockRPCState = {
	balances: Map<string, bigint>;
	calls: {method: string; params: any[]}[];
	/** called before each answer: a test can look at the database while a run is in flight */
	onCall?: (method: string) => void | Promise<void>;
	timeOffset: number;
	mined: Set<string>;
};

/** The mock node seen as a chain: its clock, what it was sent, and a way to mine it. */
function chainOf(state: MockRPCState) {
	return {
		now() {
			return Math.floor(Date.now() / 1000) + state.timeOffset;
		},
		/** move the chain's clock forward, so that a schedule falls due */
		advanceTime(seconds: number) {
			state.timeOffset += seconds;
		},
		/** every raw transaction sent so far, in order */
		get sent(): {hash: `0x${string}`; rawTx: `0x${string}`}[] {
			return state.calls
				.filter((v) => v.method === 'eth_sendRawTransaction')
				.map((v) => ({hash: keccak256(v.params[0]), rawTx: v.params[0]}));
		},
		/** include every transaction sent so far, in a block already final */
		mine() {
			for (const {hash} of this.sent) {
				state.mined.add(hash);
			}
		},
	};
}

/**
 * A minimal JSON-RPC node, answering only what the server asks while scheduling and broadcasting.
 * The test never reaches the network: requests to RPC_URL are answered here, anything else fails.
 */
function mockRPC(state: MockRPCState, method: string, params: any[]): unknown {
	state.calls.push({method, params});
	const now = Math.floor(Date.now() / 1000) + state.timeOffset;
	switch (method) {
		case 'eth_chainId':
			return '0x7a69';
		case 'eth_blockNumber':
			return `0x${LATEST_BLOCK.toString(16)}`;
		case 'eth_getBlockByNumber':
			return {
				number: `0x${LATEST_BLOCK.toString(16)}`,
				timestamp: `0x${now.toString(16)}`,
				baseFeePerGas: '0x1',
				hash: `0x${'11'.repeat(32)}`,
			};
		case 'eth_getBlockByHash':
			return {number: `0x${MINED_BLOCK.toString(16)}`, timestamp: `0x${now.toString(16)}`, hash: params[0]};
		case 'eth_feeHistory':
			return {oldestBlock: '0x1', baseFeePerGas: ['0x1', '0x1'], gasUsedRatio: [0.5], reward: [['0x1', '0x1', '0x1']]};
		case 'eth_gasPrice':
		case 'eth_maxPriorityFeePerGas':
			return '0x1';
		case 'eth_getTransactionCount':
			return '0x0';
		case 'eth_getBalance': {
			const balance = state.balances.get(String(params[0]).toLowerCase());
			return balance === undefined ? '0x56bc75e2d63100000' : `0x${balance.toString(16)}`; // 100 ether by default
		}
		case 'eth_estimateGas':
			return '0x5208';
		case 'eth_sendRawTransaction':
			return keccak256(params[0]);
		case 'eth_getTransactionReceipt':
			if (state.mined.has(params[0])) {
				return {
					transactionHash: params[0],
					blockNumber: `0x${MINED_BLOCK.toString(16)}`,
					blockHash: MINED_BLOCK_HASH,
					status: '0x1',
					gasUsed: '0x5208',
					effectiveGasPrice: '0x1',
				};
			}
			return null;
		case 'eth_getTransactionByHash':
			return null;
	}
	throw new Error(`mock RPC: unexpected method ${method}`);
}

const realFetch = globalThis.fetch;
function installMockRPC(state: MockRPCState) {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (!url.startsWith(RPC_URL)) {
			throw new Error(`test: unexpected network access to ${url}`);
		}
		const body = JSON.parse(
			typeof input === 'object' && 'text' in input && !init?.body ? await input.text() : (init?.body as string),
		);
		const requests: {method: string}[] = Array.isArray(body) ? body : [body];
		for (const request of requests) {
			await state.onCall?.(request.method);
		}
		const answer = (request: {id: number; method: string; params?: any[]}) => {
			try {
				return {jsonrpc: '2.0', id: request.id, result: mockRPC(state, request.method, request.params || [])};
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

export type TestServerOptions = {
	/** remove TOKEN_ADMIN from the env once the database is set up: a server run without one */
	forgetAdminTokenAfterSetup?: boolean;
	/** decrypt time-locked executions with this drand network (also needs TIME_LOCK_DECRYPTION=true) */
	drand?: HttpChainClient;
};

export async function createTestServer(extraEnv: Record<string, string> = {}, options: TestServerOptions = {}) {
	// the database lives in a scratch dir, never in a shared location
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzd-server-test-'));
	const dbURL = `file:${path.join(dir, 'db.sqlite')}`;
	const client = createClient({url: dbURL});
	// count what reaches the database: a D1 worker invocation may only make so many queries
	const dbStats = {requests: 0, statements: 0};
	const execute = client.execute.bind(client);
	const batch = client.batch.bind(client);
	client.execute = ((...args: Parameters<typeof execute>) => {
		dbStats.requests++;
		dbStats.statements++;
		return execute(...args);
	}) as typeof execute;
	client.batch = ((statements: any[], ...rest: any[]) => {
		dbStats.requests++;
		dbStats.statements += statements.length;
		return (batch as any)(statements, ...rest);
	}) as typeof batch;
	const db = new RemoteLibSQL(client);
	const env = {
		HD_MNEMONIC: 'test test test test test test test test test test test junk',
		[`CHAIN_${CHAIN_ID}`]: `${RPC_URL}#finality=1&worstCaseBlockTime=2`,
		TIME_LOCK_DECRYPTION: 'false',
		TOKEN_ADMIN,
		...extraEnv,
	} as Record<string, string | undefined>;
	const drand = options.drand;
	const app = createServer<any>({getDB: () => db, getEnv: () => env, getDrandClient: drand && (() => drand)});
	const rpc: MockRPCState = {balances: new Map(), calls: [], timeOffset: 0, mined: new Set()};
	const uninstallMockRPC = installMockRPC(rpc);

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

	// other server instances on the same database, each with its own connection: like several
	// `fuzd` processes, or several Worker invocations, sharing one database
	const peers: {close(): void}[] = [];
	function createPeer() {
		const peerClient = createClient({url: dbURL});
		const peerDB = new RemoteLibSQL(peerClient);
		const peerApp = createServer<any>({getDB: () => peerDB, getEnv: () => env, getDrandClient: drand && (() => drand)});
		peers.push(peerClient);
		return {
			app: peerApp,
			async getJSON(pathname: string, init?: RequestInit) {
				const response = await peerApp.fetch(new Request(`http://localhost${pathname}`, init));
				return {status: response.status, json: (await response.json()) as any};
			},
		};
	}

	const setup = await getJSON('/admin/setup', {headers: adminHeaders});
	if (!setup.json.success) {
		throw new Error(`setup failed: ${JSON.stringify(setup.json)}`);
	}
	if (options.forgetAdminTokenAfterSetup) {
		delete env.TOKEN_ADMIN;
	}

	return {
		app,
		/** the env every request reads (and the peers'): a test may change it between requests */
		env,
		db: client,
		dbStats,
		rpc,
		chain: chainOf(rpc),
		request,
		getJSON,
		postSigned,
		adminHeaders,
		createPeer,
		close() {
			uninstallMockRPC();
			for (const peer of peers) peer.close();
			client.close();
			fs.rmSync(dir, {recursive: true, force: true});
		},
	};
}

import {createClient} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createServer} from '@fuzd/server';
import {keccak256} from 'viem';

export const CHAIN_ID = '31337';
export const FUZD_URL = 'http://fuzd-client-test.invalid';
const RPC_URL = 'http://fuzd-client-test-rpc.invalid/';
const TOKEN_ADMIN = 'test-admin-token';

/** What the server asks a chain while scheduling; the test never reaches a network. */
function mockRPC(method: string, params: any[]): unknown {
	const now = Math.floor(Date.now() / 1000);
	switch (method) {
		case 'eth_chainId':
			return '0x7a69';
		case 'eth_blockNumber':
			return '0x10';
		case 'eth_getBlockByNumber':
			return {number: '0x10', timestamp: `0x${now.toString(16)}`, baseFeePerGas: '0x1', hash: `0x${'11'.repeat(32)}`};
		case 'eth_gasPrice':
		case 'eth_maxPriorityFeePerGas':
			return '0x1';
		case 'eth_getTransactionCount':
			return '0x0';
		case 'eth_getBalance':
			return '0x56bc75e2d63100000';
		case 'eth_sendRawTransaction':
			return keccak256(params[0]);
	}
	throw new Error(`mock RPC: unexpected method ${method}`);
}

export type ScheduleRequest = {body: string; signature: string | null};

/**
 * An in-process @fuzd/server on an in-memory libsql database, reached by the client through
 * `fetch` at FUZD_URL. Every scheduleExecution body that reaches it is recorded, exactly as sent.
 */
export async function createTestServer() {
	const client = createClient({url: ':memory:'});
	const db = new RemoteLibSQL(client);
	const env = {
		HD_MNEMONIC: 'test test test test test test test test test test test junk',
		[`CHAIN_${CHAIN_ID}`]: `${RPC_URL}#finality=1&worstCaseBlockTime=2`,
		TIME_LOCK_DECRYPTION: 'false',
		TOKEN_ADMIN,
	} as const;
	const app = createServer<any>({getDB: () => db, getEnv: () => env});
	const scheduleRequests: ScheduleRequest[] = [];

	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		if (request.url.startsWith(RPC_URL)) {
			const body = await request.json();
			const answer = (r: {id: number; method: string; params?: any[]}) => {
				try {
					return {jsonrpc: '2.0', id: r.id, result: mockRPC(r.method, r.params || [])};
				} catch (err: any) {
					return {jsonrpc: '2.0', id: r.id, error: {code: -32601, message: err.message}};
				}
			};
			const result = Array.isArray(body) ? body.map(answer) : answer(body);
			return new Response(JSON.stringify(result), {headers: {'content-type': 'application/json'}});
		}
		if (request.url.startsWith(FUZD_URL)) {
			if (request.url.endsWith('/api/scheduling/scheduleExecution')) {
				scheduleRequests.push({body: await request.clone().text(), signature: request.headers.get('signature')});
			}
			return app.fetch(new Request(request.url.replace(FUZD_URL, 'http://localhost'), request));
		}
		throw new Error(`test: unexpected network access to ${request.url}`);
	}) as typeof fetch;

	async function getJSON(pathname: string, init?: RequestInit) {
		const response = await app.fetch(new Request(`http://localhost${pathname}`, init));
		return (await response.json()) as any;
	}

	const adminHeaders = {Authorization: `Basic ${btoa(`admin:${TOKEN_ADMIN}`)}`};
	const setup = await getJSON('/admin/setup', {headers: adminHeaders});
	if (!setup.success) {
		throw new Error(`setup failed: ${JSON.stringify(setup)}`);
	}

	return {
		scheduleRequests,
		getJSON,
		async updateFees(fees: {fixed: string; per_1_000_000: number}) {
			const result = await getJSON(`/admin/updateFees/${CHAIN_ID}`, {
				method: 'POST',
				body: JSON.stringify(fees),
				headers: {...adminHeaders, 'content-type': 'application/json'},
			});
			if (!result.success) {
				throw new Error(`updateFees failed: ${JSON.stringify(result)}`);
			}
		},
		close() {
			globalThis.fetch = realFetch;
			client.close();
		},
	};
}

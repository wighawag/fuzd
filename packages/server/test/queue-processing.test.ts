import {afterEach, describe, expect, it, vi} from 'vitest';
import {createServer, RemoteSQLExecutorStorage} from '../src/index.js';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {privateKeyToAccount, type PrivateKeyAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';

// A game reveal: many players' executions all due at the same instant, each of which must be
// broadcast inside the reveal window. What the queue processing must guarantee for that:
// - one execution the executor refuses (unfunded account, reverting tx) never holds back the others
// - one run drains a burst, instead of a fixed handful per run
// - runs that overlap (a cron firing while the previous one still works) broadcast each execution once
// - the internal routes that trigger processing are not open to anyone

let server: TestServer | undefined;
afterEach(() => {
	server?.close();
	server = undefined;
});

type Player = {wallet: PrivateKeyAccount; account: `0x${string}`; remoteAccount: `0x${string}`};

async function createPlayer(s: TestServer, name: string): Promise<Player & {serviceParameters: unknown}> {
	const wallet = privateKeyToAccount(keccak256(toHex(name)));
	const {json} = await s.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${wallet.address}`);
	expect(json.success).toBe(true);
	return {
		wallet,
		account: wallet.address.toLowerCase() as `0x${string}`,
		remoteAccount: json.account.address,
		serviceParameters: json.account.serviceParameters,
	};
}

async function schedule(s: TestServer, player: Awaited<ReturnType<typeof createPlayer>>, slot: string, time: number) {
	const {json} = await s.postSigned('/api/scheduling/scheduleExecution', player.wallet, {
		type: 'clear',
		chainId: CHAIN_ID,
		slot,
		timing: {type: 'fixed-time', scheduledTime: time},
		executions: [
			{
				chainId: CHAIN_ID,
				transaction: {type: '0x2', gas: '0x5208', to: player.remoteAccount},
				maxFeePerGasAuthorized: '0x10',
			},
		],
		executionServiceParameters: player.serviceParameters,
	});
	expect(json).toMatchObject({success: true});
}

async function createPlayers(s: TestServer, prefix: string, count: number) {
	const players = [];
	for (let i = 0; i < count; i++) {
		players.push(await createPlayer(s, `${prefix}-${i}`));
	}
	return players;
}

/** A time a couple of seconds ahead, which the scheduler accepts, and a wait until it has passed. */
function soon() {
	const time = Math.floor(Date.now() / 1000) + 2;
	return {
		time,
		async reached() {
			const wait = (time + 1) * 1000 - Date.now();
			if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
		},
	};
}

async function processQueue(s: TestServer) {
	const {status, json} = await s.getJSON('/internal/processQueue', {headers: s.adminHeaders});
	expect(status).toBe(200);
	return json;
}

async function scheduledRows(s: TestServer) {
	const {rows} = await s.db.execute(
		'SELECT account, slot, broadcasted, retries, nextCheckTime, lastError FROM ScheduledExecutions',
	);
	return rows as unknown as {
		account: string;
		slot: string;
		broadcasted: number;
		retries: number | null;
		nextCheckTime: number;
		lastError: string | null;
	}[];
}

async function broadcastRows(s: TestServer) {
	const {rows} = await s.db.execute('SELECT account, slot, batchIndex, broadcaster, nonce FROM BroadcastedExecutions');
	return rows as unknown as {account: string; slot: string; batchIndex: number; broadcaster: string; nonce: string}[];
}

function sentTransactions(s: TestServer) {
	return s.rpc.calls.filter((v) => v.method === 'eth_sendRawTransaction').length;
}

describe('processQueue', () => {
	it('does not let executions the executor refuses hold back the others', async () => {
		// batches smaller than the refused executions: only rescheduling them lets the others through
		server = await createTestServer({PROCESSING_BATCH_SIZE: '5', PROCESSING_MAX_ITEMS_PER_RUN: '5'});
		const at = soon();
		// more refused executions than a run used to take, scheduled first so they sit at the head of the queue
		const unfunded = await createPlayers(server, 'unfunded', 12);
		for (const player of unfunded) {
			server.rpc.balances.set(player.remoteAccount.toLowerCase(), 0n);
			await schedule(server, player, 'reveal', at.time);
		}
		const funded = await createPlayers(server, 'funded', 5);
		for (const player of funded) {
			await schedule(server, player, 'reveal', at.time);
		}
		await at.reached();

		// 12 refused then 5 funded, 5 per run: the funded ones are reached by the 4th run
		for (let i = 0; i < 4; i++) {
			await processQueue(server);
		}

		const rows = await scheduledRows(server);
		const fundedAccounts = new Set(funded.map((v) => v.account));
		const fundedRows = rows.filter((v) => fundedAccounts.has(v.account));
		expect(fundedRows.map((v) => v.broadcasted)).toEqual([1, 1, 1, 1, 1]);

		// the refused ones are kept, with their error, and pushed back to be retried later
		const unfundedRows = rows.filter((v) => !fundedAccounts.has(v.account));
		expect(unfundedRows).toHaveLength(12);
		for (const row of unfundedRows) {
			expect(row.broadcasted).toBe(0);
			expect(row.lastError).toMatch(/balance/);
			expect(Number(row.retries)).toBeGreaterThanOrEqual(1);
			expect(Number(row.nextCheckTime)).toBeGreaterThan(at.time);
		}
	});

	it('broadcasts a whole burst of due executions in one run', async () => {
		server = await createTestServer();
		const at = soon();
		const players = await createPlayers(server, 'burst', 60);
		for (const player of players) {
			await schedule(server, player, 'reveal', at.time);
		}
		await at.reached();

		const before = {...server.dbStats};
		await processQueue(server);
		const statementsPerExecution = (server.dbStats.statements - before.statements) / players.length;
		console.log(`database statements per execution: ${statementsPerExecution.toFixed(1)}`);

		const rows = await scheduledRows(server);
		expect(rows.filter((v) => v.broadcasted === 1)).toHaveLength(60);
		expect(sentTransactions(server)).toBe(60);
	});

	it('never sends the executions of one account concurrently', async () => {
		server = await createTestServer();
		const at = soon();
		const [player] = await createPlayers(server, 'ordered', 1);
		for (let i = 0; i < 5; i++) {
			await schedule(server, player, `slot-${i}`, at.time);
		}
		await at.reached();

		await processQueue(server);

		const rows = await broadcastRows(server);
		// concurrent sends from one broadcaster would collide on its lock and leave some unsent
		expect(rows).toHaveLength(5);
		expect(new Set(rows.map((v) => Number(v.nonce)))).toEqual(new Set([0, 1, 2, 3, 4]));
	});

	it('broadcasts each execution once when runs overlap', async () => {
		server = await createTestServer();
		const at = soon();
		const players = await createPlayers(server, 'overlap', 30);
		for (const player of players) {
			await schedule(server, player, 'reveal', at.time);
		}
		await at.reached();

		await Promise.all([processQueue(server), processQueue(server), processQueue(server)]);
		await processQueue(server);

		const rows = await broadcastRows(server);
		expect(rows).toHaveLength(30);
		// one transaction per remote account, at its first nonce: none was sent twice
		expect(rows.map((v) => Number(v.nonce))).toEqual(new Array(30).fill(0));
		expect(sentTransactions(server)).toBe(30);
	});
});

describe('processTransactions', () => {
	it('checks every due broadcast transaction in one run', async () => {
		server = await createTestServer();
		const at = soon();
		const players = await createPlayers(server, 'pending', 40);
		for (const player of players) {
			await schedule(server, player, 'reveal', at.time);
		}
		await at.reached();
		await processQueue(server);
		expect(await broadcastRows(server)).toHaveLength(40);

		// make every broadcast transaction due for its next check
		await server.db.execute('UPDATE BroadcastedExecutions SET nextCheckTime = 0');
		const before = server.rpc.calls.length;
		const {status} = await server.getJSON('/internal/processTransactions', {headers: server.adminHeaders});
		expect(status).toBe(200);

		const checked = new Set(
			server.rpc.calls
				.slice(before)
				.filter((v) => v.method === 'eth_getTransactionByHash' || v.method === 'eth_getTransactionReceipt')
				.map((v) => v.params[0]),
		);
		expect(checked.size).toBe(40);

		// none was stored again (still pending): each one's next check moved forward instead
		const {rows} = await server.db.execute('SELECT nextCheckTime FROM BroadcastedExecutions');
		const now = Math.floor(Date.now() / 1000);
		for (const row of rows) {
			expect(Number(row.nextCheckTime)).toBeGreaterThan(now);
		}
	});

	it('postpones a pending execution only if it was not resubmitted meanwhile', async () => {
		server = await createTestServer();
		const at = soon();
		const [player] = await createPlayers(server, 'postpone', 1);
		await schedule(server, player, 'reveal', at.time);
		await at.reached();
		await processQueue(server);
		const [row] = (await server.db.execute('SELECT * FROM BroadcastedExecutions')).rows as any[];
		const storage = new RemoteSQLExecutorStorage(new RemoteLibSQL(server.db));
		const key = {chainId: row.chainId, account: row.account, slot: row.slot, batchIndex: Number(row.batchIndex)};

		// a different hash means another run resubmitted it: its row is left alone
		await storage.postponePendingExecution({...key, hash: `0x${'ab'.repeat(32)}`}, 12345, 'should not be written');
		let [after] = (await server.db.execute('SELECT nextCheckTime, lastError FROM BroadcastedExecutions')).rows as any[];
		expect(Number(after.nextCheckTime)).toBe(Number(row.nextCheckTime));
		expect(after.lastError).toBe(row.lastError);

		await storage.postponePendingExecution({...key, hash: row.hash}, 12345, 'rpc down');
		[after] = (await server.db.execute('SELECT nextCheckTime, lastError FROM BroadcastedExecutions')).rows as any[];
		expect(Number(after.nextCheckTime)).toBe(12345);
		expect(after.lastError).toBe('rpc down');
	});
});

describe('internal routes', () => {
	it('creates the server without generating random values (a Worker forbids it in global scope)', async () => {
		const spy = vi.spyOn(crypto, 'getRandomValues');
		try {
			const app = createServer<any>({getDB: () => undefined as any, getEnv: () => ({}) as any});
			expect(spy).not.toHaveBeenCalled();
			expect(app.internalRequest('processQueue').headers.get('x-fuzd-internal-token')).toMatch(/^[0-9a-f]{64}$/);
		} finally {
			spy.mockRestore();
		}
	});

	it('accepts the token of its own server instance, and only that one', async () => {
		server = await createTestServer();
		const own = await server.app.fetch(server.app.internalRequest('processQueue'));
		expect(own.status).toBe(200);
		const other = createServer<any>({getDB: () => undefined as any, getEnv: () => ({}) as any});
		const foreign = await server.app.fetch(other.internalRequest('processQueue'));
		expect(foreign.status).toBe(401);
	});

	for (const action of ['processQueue', 'processTransactions', 'checkScheduledExecutionStatus']) {
		it(`refuses /internal/${action} without credentials`, async () => {
			server = await createTestServer();
			const anonymous = await server.request(`/internal/${action}`);
			expect(anonymous.status).toBe(401);
			const admin = await server.request(`/internal/${action}`, {headers: server.adminHeaders});
			expect(admin.status).toBe(200);
		});
	}
});

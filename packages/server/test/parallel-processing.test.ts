import {afterEach, describe, expect, it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';
import {createProcessingLoop} from '../src/index.js';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';

// More than one processing run at a time, on one database: several cron triggers, a pool of
// Durable Object loops, several `fuzd` processes. Each due item must be CLAIMED by one run only
// (docs/adr/0004), a claim must expire so that a crashed run's items come back, and a run must
// say when it stopped on its budget, so a loop can start the next one at once.

let server: TestServer | undefined;
afterEach(() => {
	server?.close();
	server = undefined;
});

type Peer = {getJSON: TestServer['getJSON']};

async function createPlayers(s: TestServer, prefix: string, count: number) {
	const players = [];
	for (let i = 0; i < count; i++) {
		const wallet = privateKeyToAccount(keccak256(toHex(`${prefix}-${i}`)));
		const {json} = await s.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${wallet.address}`);
		expect(json.success).toBe(true);
		players.push({
			wallet,
			account: wallet.address.toLowerCase() as `0x${string}`,
			remoteAccount: json.account.address as `0x${string}`,
			serviceParameters: json.account.serviceParameters,
		});
	}
	return players;
}

async function scheduleAll(s: TestServer, players: Awaited<ReturnType<typeof createPlayers>>, time: number) {
	for (const player of players) {
		const {json} = await s.postSigned('/api/scheduling/scheduleExecution', player.wallet, {
			type: 'clear',
			chainId: CHAIN_ID,
			slot: 'reveal',
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
}

/** A burst due in a couple of seconds, and a wait until it is due. */
async function dueBurst(s: TestServer, prefix: string, count: number) {
	const players = await createPlayers(s, prefix, count);
	const time = Math.floor(Date.now() / 1000) + 3;
	await scheduleAll(s, players, time);
	const wait = (time + 1) * 1000 - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	return players;
}

async function run(peer: Peer, action: 'processQueue' | 'processTransactions') {
	const {status, json} = await peer.getJSON(`/internal/${action}`, {headers: server!.adminHeaders});
	expect(status).toBe(200);
	return json;
}

function sentTransactions(s: TestServer) {
	return s.rpc.calls.filter((v) => v.method === 'eth_sendRawTransaction').length;
}

function countByKey(keys: string[]) {
	const counts = new Map<string, number>();
	for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
	return counts;
}

async function claimedRows(s: TestServer, table: 'ScheduledExecutions' | 'BroadcastedExecutions') {
	const {rows} = await s.db.execute(`SELECT count(*) AS n FROM ${table} WHERE claimedBy IS NOT NULL`);
	return Number((rows[0] as any).n);
}

describe('concurrent processQueue runs', () => {
	it('never process the same execution, and leave every broadcast execution marked as such', async () => {
		server = await createTestServer();
		const players = await dueBurst(server, 'concurrent', 40);
		const peers = [server, server.createPeer(), server.createPeer()];

		const results = await Promise.all(peers.map((peer) => run(peer, 'processQueue')));

		const handled = results.flatMap((r) => r.result.executions.map((v: any) => `${v.account}/${v.slot}`));
		const duplicates = [...countByKey(handled)].filter(([, n]) => n > 1);
		expect(duplicates).toEqual([]);
		expect(new Set(handled).size).toBe(players.length);

		expect(sentTransactions(server)).toBe(players.length);
		const {rows: broadcast} = await server.db.execute('SELECT nonce FROM BroadcastedExecutions');
		expect(broadcast.map((v: any) => Number(v.nonce))).toEqual(new Array(players.length).fill(0));
		// no run that lost a race rewrote a broadcast execution as not broadcast (the old residual)
		const {rows: scheduled} = await server.db.execute('SELECT broadcasted FROM ScheduledExecutions');
		expect(scheduled.map((v: any) => v.broadcasted)).toEqual(new Array(players.length).fill(1));
		expect(await claimedRows(server, 'ScheduledExecutions')).toBe(0);
	});

	it('release the claims of the executions they could not broadcast', async () => {
		server = await createTestServer();
		const players = await createPlayers(server, 'refused', 6);
		for (const player of players) {
			server.rpc.balances.set(player.remoteAccount.toLowerCase(), 0n);
		}
		const time = Math.floor(Date.now() / 1000) + 2;
		await scheduleAll(server, players, time);
		await new Promise((resolve) => setTimeout(resolve, (time + 1) * 1000 - Date.now()));

		await Promise.all([run(server, 'processQueue'), run(server.createPeer(), 'processQueue')]);

		const {rows} = await server.db.execute('SELECT retries, lastError FROM ScheduledExecutions');
		expect(rows).toHaveLength(6);
		for (const row of rows as any[]) {
			expect(row.lastError).toMatch(/balance/);
			expect(Number(row.retries)).toBe(1); // handled once, by one run
		}
		expect(await claimedRows(server, 'ScheduledExecutions')).toBe(0);
	});
});

describe('concurrent processTransactions runs', () => {
	it('never check the same transaction', async () => {
		server = await createTestServer();
		const players = await dueBurst(server, 'pending', 30);
		await run(server, 'processQueue');
		await server.db.execute('UPDATE BroadcastedExecutions SET nextCheckTime = 0');
		const peers = [server, server.createPeer(), server.createPeer()];

		const results = await Promise.all(peers.map((peer) => run(peer, 'processTransactions')));

		const checked = results.flatMap((r) => r.transactions.map((v: any) => `${v.account}/${v.slot}/${v.batchIndex}`));
		expect([...countByKey(checked)].filter(([, n]) => n > 1)).toEqual([]);
		expect(new Set(checked).size).toBe(players.length);
		expect(await claimedRows(server, 'BroadcastedExecutions')).toBe(0);
	});
});

describe('a claim', () => {
	it('keeps its executions from other runs until it expires, then they are processed', async () => {
		server = await createTestServer();
		const players = await dueBurst(server, 'crashed', 5);
		// a run claimed them, then died
		await server.db.execute({
			sql: "UPDATE ScheduledExecutions SET claimedBy = 'crashed-run', claimExpiresAt = ?",
			args: [Date.now() + 60_000],
		});

		await run(server, 'processQueue');
		expect(sentTransactions(server)).toBe(0);

		await server.db.execute({sql: 'UPDATE ScheduledExecutions SET claimExpiresAt = ?', args: [Date.now() - 1]});
		await run(server, 'processQueue');
		expect(sentTransactions(server)).toBe(players.length);
		expect(await claimedRows(server, 'ScheduledExecutions')).toBe(0);
	});

	it('of a pending transaction expires too', async () => {
		server = await createTestServer();
		const players = await dueBurst(server, 'crashed-pending', 4);
		await run(server, 'processQueue');
		await server.db.execute({
			sql: "UPDATE BroadcastedExecutions SET nextCheckTime = 0, claimedBy = 'crashed-run', claimExpiresAt = ?",
			args: [Date.now() + 60_000],
		});

		expect((await run(server, 'processTransactions')).transactions).toHaveLength(0);

		await server.db.execute({sql: 'UPDATE BroadcastedExecutions SET claimExpiresAt = ?', args: [Date.now() - 1]});
		expect((await run(server, 'processTransactions')).transactions).toHaveLength(players.length);
	});

	it('lasts the configured lease', async () => {
		server = await createTestServer({PROCESSING_LEASE_DURATION_MS: '90000'});
		await dueBurst(server, 'lease', 1);
		// look at the claim while the run holds it: when the executor asks the chain for the nonce
		let seen: number | undefined;
		const before = Date.now();
		const db = server.db;
		server.rpc.onCall = async (method) => {
			if (method === 'eth_getTransactionCount' && seen === undefined) {
				const {rows} = await db.execute('SELECT claimExpiresAt FROM ScheduledExecutions');
				seen = Number((rows[0] as any).claimExpiresAt);
			}
		};
		await run(server, 'processQueue');
		server.rpc.onCall = undefined;
		expect(seen).toBeGreaterThanOrEqual(before + 90_000);
		expect(seen).toBeLessThanOrEqual(Date.now() + 90_000);
	});
});

describe('a run', () => {
	it('says when it stopped on its budget, and a processing loop then runs again at once', async () => {
		server = await createTestServer({PROCESSING_MAX_ITEMS_PER_RUN: '5', PROCESSING_BATCH_SIZE: '5'});
		const players = await dueBurst(server, 'loop', 12);

		const first = await run(server, 'processQueue');
		expect(first.result.budgetExhausted).toBe(true);
		expect(sentTransactions(server)).toBe(5);

		// an interval far longer than the test: only running back to back can drain the rest in time
		const loop = createProcessingLoop(server.app, {intervalMs: 60_000});
		try {
			const deadline = Date.now() + 10_000;
			while (sentTransactions(server) < players.length && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		} finally {
			await loop.stop();
		}
		expect(sentTransactions(server)).toBe(players.length);

		const last = await run(server, 'processQueue');
		expect(last.result.budgetExhausted).toBe(false);
	});
});

describe('the setup', () => {
	it('adds the claim columns to a database created before them', async () => {
		server = await createTestServer();
		for (const table of ['ScheduledExecutions', 'BroadcastedExecutions']) {
			await server.db.execute(`DROP INDEX idx_${table}_claimedBy`);
			await server.db.execute(`ALTER TABLE ${table} DROP COLUMN claimedBy`);
			await server.db.execute(`ALTER TABLE ${table} DROP COLUMN claimExpiresAt`);
		}

		const {json} = await server.getJSON('/admin/setup', {headers: server.adminHeaders});
		expect(json).toEqual({success: true});
		// and again: the setup is idempotent
		expect((await server.getJSON('/admin/setup', {headers: server.adminHeaders})).json).toEqual({success: true});

		for (const table of ['ScheduledExecutions', 'BroadcastedExecutions']) {
			const {rows} = await server.db.execute(`PRAGMA table_info(${table})`);
			expect(rows.map((v: any) => v.name)).toEqual(expect.arrayContaining(['claimedBy', 'claimExpiresAt']));
			const {rows: indexes} = await server.db.execute(`PRAGMA index_list(${table})`);
			expect(indexes.map((v: any) => v.name)).toContain(`idx_${table}_claimedBy`);
		}
		await dueBurst(server, 'upgraded', 2);
		await run(server, 'processQueue');
		expect(sentTransactions(server)).toBe(2);
	});
});

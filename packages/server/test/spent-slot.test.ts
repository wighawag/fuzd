import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {parseTransaction} from 'viem';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';

// A slot is the unit a schedule replaces. While nothing of it has been broadcast, a new schedule
// into it replaces the queued one. Once any of its batch indices has been broadcast the slot is
// spent: the executor would answer slotAlreadyUsed for those indices and never send the new
// transactions, so the schedule is refused outright.

const wallet = privateKeyToAccount(`0x${'33'.repeat(32)}`);
const account = wallet.address.toLowerCase() as `0x${string}`;
const first = `0x${'aa'.repeat(20)}` as const; // where the first schedule sends
const second = `0x${'bb'.repeat(20)}` as const; // where the second one does
const DELAY = 60;

let server: TestServer;
let serviceParameters: any;

beforeEach(async () => {
	server = await createTestServer();
	const {json} = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${account}`);
	expect(json.success).toBe(true);
	serviceParameters = json.account.serviceParameters;
});

afterEach(() => {
	server?.close();
});

function tx(to: `0x${string}`, extra?: {gas?: `0x${string}`}) {
	return {
		chainId: CHAIN_ID,
		transaction: {type: '0x2', gas: extra?.gas || '0x5208', to},
		maxFeePerGasAuthorized: '0x10',
	};
}

function schedule(slot: string, executions: ReturnType<typeof tx>[]) {
	return server.postSigned('/api/scheduling/scheduleExecution', wallet, {
		type: 'clear',
		chainId: CHAIN_ID,
		slot,
		timing: {type: 'fixed-time', scheduledTime: server.chain.now() + DELAY},
		executions,
		executionServiceParameters: serviceParameters,
	});
}

/** let the schedules fall due, then run the scheduler once */
async function processQueue() {
	server.chain.advanceTime(DELAY + 1);
	const {json} = await server.getJSON('/internal/processQueue', {headers: server.adminHeaders});
	return json;
}

async function queued(slot: string) {
	const {json} = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${account}/${slot}`);
	return json.execution;
}

async function broadcast(slot: string, batchIndex: number) {
	const {json} = await server.getJSON(`/api/execution/execution/${CHAIN_ID}/${account}/${slot}/${batchIndex}`);
	return json.execution;
}

/** the recipient of every transaction the mock chain has received, in order */
function sentTo() {
	return server.chain.sent.map(({rawTx}) => parseTransaction(rawTx).to);
}

function expectSlotRefused(response: {status: number; json: any}, slot: string) {
	expect(response.status).toBe(500);
	expect(response.json.success).toBe(false);
	expect(response.json.errors).toHaveLength(1);
	const {message} = response.json.errors[0];
	expect(message).toContain(CHAIN_ID);
	expect(message).toContain(account);
	expect(message).toContain(slot);
	expect(message).toMatch(/already (been )?(used|broadcast)/);
}

describe('a schedule into a slot', () => {
	it('that is only queued replaces it: only the new batch is broadcast', async () => {
		const slot = 'queued';
		expect((await schedule(slot, [tx(first), tx(first)])).json.success).toBe(true);
		const replaced = await schedule(slot, [tx(second)]);
		expect(replaced).toMatchObject({status: 200, json: {success: true}});

		await processQueue();

		expect(sentTo()).toEqual([second]);
		expect((await broadcast(slot, 0)).transaction.to).toEqual(second);
		expect(await broadcast(slot, 1)).toBeUndefined();
		expect((await queued(slot)).broadcasted).toBe(true);
	});

	it('already broadcast (pending) is refused, and nothing changes', async () => {
		const slot = 'pending';
		expect((await schedule(slot, [tx(first)])).json.success).toBe(true);
		await processQueue();
		expect(sentTo()).toEqual([first]);
		const queuedBefore = await queued(slot);
		const broadcastBefore = await broadcast(slot, 0);
		expect(queuedBefore.broadcasted).toBe(true);
		expect(queuedBefore.finalized).toBe(false);

		// a longer batch too: its extra index would otherwise be sent under the spent slot
		expectSlotRefused(await schedule(slot, [tx(second), tx(second)]), slot);

		expect(await queued(slot)).toEqual(queuedBefore);
		expect(await broadcast(slot, 0)).toEqual(broadcastBefore);
		await processQueue();
		expect(sentTo()).toEqual([first]);
		expect(await broadcast(slot, 1)).toBeUndefined();
	});

	it('already broadcast and finalised is refused, and nothing changes', async () => {
		const slot = 'finalised';
		expect((await schedule(slot, [tx(first)])).json.success).toBe(true);
		await processQueue();
		server.chain.mine();
		// the transaction is checked again after a while (processTransactions takes due ones only)
		server.chain.advanceTime(600);
		expect((await server.getJSON('/internal/processTransactions', {headers: server.adminHeaders})).json.success).toBe(
			true,
		);
		expect(
			(await server.getJSON('/internal/checkScheduledExecutionStatus', {headers: server.adminHeaders})).json.success,
		).toBe(true);
		const queuedBefore = await queued(slot);
		const broadcastBefore = await broadcast(slot, 0);
		expect(broadcastBefore.finalized).toBe(true);
		expect(queuedBefore.finalized).toBe(true);

		expectSlotRefused(await schedule(slot, [tx(second)]), slot);

		expect(await queued(slot)).toEqual(queuedBefore);
		expect(await broadcast(slot, 0)).toEqual(broadcastBefore);
		await processQueue();
		expect(sentTo()).toEqual([first]);
	});

	it('partially broadcast (an index sent, the queued record not marked) is refused', async () => {
		const slot = 'partial';
		// the second transaction costs more than the remote account holds, so the executor sends
		// index 0, then throws at index 1, and the scheduler keeps the record queued
		const tooMuchGas = '0x6000000000000000' as const;
		expect((await schedule(slot, [tx(first), tx(first, {gas: tooMuchGas})])).json.success).toBe(true);
		await processQueue();
		expect(sentTo()).toEqual([first]);
		const queuedBefore = await queued(slot);
		const broadcastBefore = await broadcast(slot, 0);
		expect(queuedBefore.broadcasted).toBe(false);
		expect(broadcastBefore).toBeDefined();
		expect(await broadcast(slot, 1)).toBeUndefined();

		expectSlotRefused(await schedule(slot, [tx(second), tx(second)]), slot);

		expect(await queued(slot)).toEqual(queuedBefore);
		expect(await broadcast(slot, 0)).toEqual(broadcastBefore);
	});

	it('whose earlier schedule was archived without any broadcast is accepted', async () => {
		const slot = 'archived';
		expect((await schedule(slot, [tx(first)])).json.success).toBe(true);
		const archived = await server.getJSON(`/admin/archiveSubmission/${CHAIN_ID}/${account}/${slot}`, {
			method: 'POST',
			headers: server.adminHeaders,
		});
		expect(archived.json).toEqual({success: true});
		expect(await queued(slot)).toBeUndefined();

		expect(await schedule(slot, [tx(second)])).toMatchObject({status: 200, json: {success: true}});
		await processQueue();
		expect(sentTo()).toEqual([second]);
		expect((await broadcast(slot, 0)).transaction.to).toEqual(second);
	});
});

describe('a schedule into a slot a run is processing', () => {
	// between a run's claim and the executor storing what it broadcast, the slot looks free (queued,
	// nothing in the executor): a schedule accepted then would never be sent (the next run meets the
	// executor's record with slotAlreadyUsed). It is refused, to be tried again once the run is over.
	it('is refused while the run holds the slot, and the run broadcasts what it read', async () => {
		const slot = 'in-flight';
		expect((await schedule(slot, [tx(first)])).json.success).toBe(true);
		let during: {status: number; json: any} | undefined;
		server.rpc.onCall = async (method) => {
			if (method === 'eth_getTransactionCount' && !during) {
				during = {status: 0, json: undefined};
				during = await schedule(slot, [tx(second)]);
			}
		};
		await processQueue();
		server.rpc.onCall = undefined;

		expect(during!.status).toBe(500);
		expect(during!.json.errors[0].message).toMatch(/being processed/);
		expect(during!.json.errors[0].message).toContain(slot);
		expect(sentTo()).toEqual([first]);
		expect((await queued(slot)).broadcasted).toBe(true);
		// and afterwards the slot is spent
		expectSlotRefused(await schedule(slot, [tx(second)]), slot);
	});
});

describe('a slot archived twice', () => {
	// a slot archived without a broadcast is free again: its next schedule may be archived too, and
	// the archive keeps one record per slot (the latest)
	it('is archived again, and its next schedule is accepted', async () => {
		const slot = 'archived-twice';
		const archive = () =>
			server.getJSON(`/admin/archiveSubmission/${CHAIN_ID}/${account}/${slot}`, {
				method: 'POST',
				headers: server.adminHeaders,
			});
		expect((await schedule(slot, [tx(first)])).json.success).toBe(true);
		expect((await archive()).json).toEqual({success: true});
		expect((await schedule(slot, [tx(second)])).json.success).toBe(true);
		expect((await archive()).json).toEqual({success: true});
		expect(await queued(slot)).toBeUndefined();
		const {rows} = await server.db.execute({
			sql: 'SELECT payload FROM ArchivedScheduledExecutions WHERE account = ? AND slot = ?',
			args: [account, slot],
		});
		expect(rows.map((v: any) => JSON.parse(v.payload)[0].transaction.to)).toEqual([second]);

		expect((await schedule(slot, [tx(first)])).json.success).toBe(true);
	});
});

describe('a broadcast schedule the executor holds nothing for', () => {
	// An empty clear batch is accepted and marked broadcast without the executor storing anything
	// (as is a slot whose executor records were pruned before its status was checked). Its status
	// check must still finalise it: an unfinalised record stays at the front of the status queue.
	it('is finalised by the status check', async () => {
		const slot = 'empty';
		expect((await schedule(slot, [])).json.success).toBe(true);
		await processQueue();
		expect((await queued(slot)).broadcasted).toBe(true);
		expect(await broadcast(slot, 0)).toBeUndefined();

		const {json} = await server.getJSON('/internal/checkScheduledExecutionStatus', {headers: server.adminHeaders});
		expect(json.success).toBe(true);
		expect((await queued(slot)).finalized).toBe(true);
	});
});

import {afterEach, describe, expect, it} from 'vitest';
import {createClient, type Client} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import type {ScheduledExecutionQueued} from '@fuzd/scheduler';
import {RemoteSQLSchedulerStorage} from '../src/storage/RemoteSQLSchedulerStorage.js';

// A processing run writes an execution back only while it still holds its claim (docs/adr/0004):
// once its lease expired and another run took the execution, or a new schedule replaced it, the
// run's late write must not land, and its archive must neither archive nor delete anything.

let client: Client | undefined;
afterEach(() => {
	client?.close();
	client = undefined;
});

const execution: ScheduledExecutionQueued<any> = {
	chainId: '31337',
	account: `0x${'11'.repeat(20)}`,
	slot: 'reveal',
	type: 'clear',
	broadcasted: false,
	finalized: false,
	checkinTime: 100,
	retries: 0,
	timing: {type: 'fixed-time', scheduledTime: 100},
	executions: [],
	executionServiceParameters: {} as any,
};

async function createStorage() {
	client = createClient({url: ':memory:'});
	const storage = new RemoteSQLSchedulerStorage<any>(new RemoteLibSQL(client));
	await storage.setup();
	await storage.createOrUpdateQueuedExecution(execution);
	await storage.claimDueExecutions({
		limit: 10,
		chainId: execution.chainId,
		upToCheckinTime: 1000,
		claim: {by: 'run-a', now: Date.now(), expiresAt: Date.now() + 60_000},
	});
	return storage;
}

async function rows(table: 'ScheduledExecutions' | 'ArchivedScheduledExecutions') {
	// the archive has no claim columns
	const columns =
		table === 'ScheduledExecutions' ? 'slot, broadcasted, retries, claimedBy' : 'slot, broadcasted, retries';
	const {rows} = await client!.execute(`SELECT ${columns} FROM ${table}`);
	return rows.map((v: any) => ({...v}));
}

describe('a claimed write', () => {
	it('applies, and releases the claim, while the run holds it', async () => {
		const storage = await createStorage();
		expect(await storage.updateClaimedExecution({...execution, broadcasted: true}, 'run-a')).toBe(true);
		expect(await rows('ScheduledExecutions')).toEqual([{slot: 'reveal', broadcasted: 1, retries: 0, claimedBy: null}]);
	});

	it('does nothing once another run holds the execution', async () => {
		const storage = await createStorage();
		await client!.execute("UPDATE ScheduledExecutions SET claimedBy = 'run-b', broadcasted = 1");
		expect(await storage.updateClaimedExecution({...execution, retries: 1}, 'run-a')).toBe(false);
		expect(await rows('ScheduledExecutions')).toEqual([
			{slot: 'reveal', broadcasted: 1, retries: 0, claimedBy: 'run-b'},
		]);
	});

	it('does not bring back an execution archived meanwhile', async () => {
		const storage = await createStorage();
		await client!.execute('DELETE FROM ScheduledExecutions');
		expect(await storage.updateClaimedExecution({...execution, retries: 1}, 'run-a')).toBe(false);
		expect(await rows('ScheduledExecutions')).toEqual([]);
	});
});

describe('a claimed archive', () => {
	it('archives while the run holds the execution', async () => {
		const storage = await createStorage();
		expect(await storage.archiveClaimedExecution(execution, 'run-a')).toBe(true);
		expect(await rows('ScheduledExecutions')).toEqual([]);
		expect(await rows('ArchivedScheduledExecutions')).toEqual([{slot: 'reveal', broadcasted: 0, retries: 0}]);
	});

	it('neither archives nor deletes once another run holds the execution', async () => {
		const storage = await createStorage();
		await client!.execute("UPDATE ScheduledExecutions SET claimedBy = 'run-b'");
		expect(await storage.archiveClaimedExecution(execution, 'run-a')).toBe(false);
		expect(await rows('ScheduledExecutions')).toEqual([
			{slot: 'reveal', broadcasted: 0, retries: 0, claimedBy: 'run-b'},
		]);
		expect(await rows('ArchivedScheduledExecutions')).toEqual([]);
	});

	it('neither archives nor deletes once a new schedule replaced the execution', async () => {
		const storage = await createStorage();
		// a new schedule into the slot: written by the user, it releases the claim
		await storage.createOrUpdateQueuedExecution({...execution, checkinTime: 200});
		expect(await storage.archiveClaimedExecution(execution, 'run-a')).toBe(false);
		expect(await rows('ScheduledExecutions')).toEqual([{slot: 'reveal', broadcasted: 0, retries: 0, claimedBy: null}]);
		expect(await rows('ArchivedScheduledExecutions')).toEqual([]);
	});
});

describe('marking an execution finalized', () => {
	it('sets the flag of a broadcast execution, and nothing else', async () => {
		const storage = await createStorage();
		await client!.execute('UPDATE ScheduledExecutions SET broadcasted = 1, retries = 3');
		expect(await storage.markExecutionFinalized({...execution, broadcasted: true, retries: 0})).toBe(true);
		const {rows: found} = await client!.execute('SELECT broadcasted, finalized, retries FROM ScheduledExecutions');
		expect(found.map((v: any) => ({...v}))).toEqual([{broadcasted: 1, finalized: 1, retries: 3}]);
	});

	it('leaves alone a new schedule written into the slot meanwhile', async () => {
		const storage = await createStorage();
		// the status check read the broadcast execution, then a new schedule replaced it
		await storage.createOrUpdateQueuedExecution({...execution, checkinTime: 200});
		expect(await storage.markExecutionFinalized({...execution, broadcasted: true})).toBe(false);
		const {rows: found} = await client!.execute(
			'SELECT broadcasted, finalized, nextCheckTime FROM ScheduledExecutions',
		);
		expect(found.map((v: any) => ({...v}))).toEqual([{broadcasted: 0, finalized: 0, nextCheckTime: 200}]);
	});
});

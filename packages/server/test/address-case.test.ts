import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {getAddress} from 'viem';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';

// A caller may send an address checksummed (EIP-55, what wallets and viem produce) or lowercase.
// Every route must accept both, normalise once, and reach the same record (docs/adr/0003).

const wallet = privateKeyToAccount('0x1111111111111111111111111111111111111111111111111111111111111111');
const checksummed = wallet.address;
const lowercase = wallet.address.toLowerCase() as `0x${string}`;
const onBehalf = privateKeyToAccount(`0x${'22'.repeat(32)}`).address; // checksummed on purpose

let server: TestServer;
let serviceParameters: any;
let broadcaster: `0x${string}`;

beforeAll(async () => {
	expect(checksummed).not.toEqual(lowercase); // the fixture must exercise both forms
	server = await createTestServer();
	const {json} = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${checksummed}`);
	expect(json.success).toBe(true);
	serviceParameters = json.account.serviceParameters;
	broadcaster = json.account.address;
});

afterAll(() => {
	server?.close();
});

function scheduledExecution(slot: string, extra?: Record<string, unknown>) {
	return {
		type: 'clear',
		chainId: CHAIN_ID,
		slot,
		timing: {type: 'fixed-time', scheduledTime: Math.floor(Date.now() / 1000) + 3600},
		executions: [
			{
				chainId: CHAIN_ID,
				transaction: {type: '0x2', gas: '0x5208', to: checksummed},
				maxFeePerGasAuthorized: '0x10',
			},
		],
		executionServiceParameters: serviceParameters,
		...extra,
	};
}

describe('remoteAccount/:chainId/:account', () => {
	it('derives the same broadcaster from either form, and returns it lowercase', async () => {
		const a = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${checksummed}`);
		const b = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${lowercase}`);
		expect(a.status).toBe(200);
		expect(b.json).toEqual(a.json);
		expect(a.json.account.address).toEqual(a.json.account.address.toLowerCase());
	});
});

describe('scheduling', () => {
	const slot = 'slot-scheduling';

	beforeAll(async () => {
		const {status, json} = await server.postSigned(
			'/api/scheduling/scheduleExecution',
			wallet,
			scheduledExecution(slot, {
				onBehalf,
				paymentReserve: {amount: '1000', broadcaster: getAddress(broadcaster)},
			}),
		);
		expect(json).toMatchObject({success: true});
		expect(status).toBe(200);
		// the signer is recovered checksummed, and stored lowercase
		expect(json.info.account).toEqual(lowercase);
	});

	it('scheduledExecution/:chainId/:account/:slot finds the record from either form', async () => {
		const a = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${checksummed}/${slot}`);
		const b = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${lowercase}/${slot}`);
		expect(a.json.execution).toBeDefined();
		expect(a.json.execution.account).toEqual(lowercase);
		expect(b.json).toEqual(a.json);
	});

	it('normalises addresses inside the body (onBehalf, paymentReserve, transaction)', async () => {
		const {json} = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${lowercase}/${slot}`);
		expect(json.execution.onBehalf).toEqual(onBehalf.toLowerCase());
		expect(json.execution.paymentReserve.broadcaster).toEqual(broadcaster.toLowerCase());
		expect(json.execution.executions[0].transaction.to).toEqual(lowercase);
	});

	it('scheduledExecutions/:chainId/:account lists the same records from either form', async () => {
		const a = await server.getJSON(`/api/scheduling/scheduledExecutions/${CHAIN_ID}/${checksummed}`);
		const b = await server.getJSON(`/api/scheduling/scheduledExecutions/${CHAIN_ID}/${lowercase}`);
		expect(a.json.executions.map((v: any) => v.slot)).toContain(slot);
		expect(b.json).toEqual(a.json);
	});

	it('reserved/:chainId/:broadcaster/:slot counts the reserve from either form', async () => {
		const a = await server.getJSON(`/api/scheduling/reserved/${CHAIN_ID}/${getAddress(broadcaster)}/other-slot`);
		const b = await server.getJSON(`/api/scheduling/reserved/${CHAIN_ID}/${broadcaster.toLowerCase()}/other-slot`);
		expect(a.json).toEqual({success: true, total: '1000'});
		expect(b.json).toEqual(a.json);
	});

	it('a resubmission for the same slot replaces the record whatever the case of the body', async () => {
		await server.postSigned(
			'/api/scheduling/scheduleExecution',
			wallet,
			scheduledExecution(slot, {onBehalf: onBehalf.toLowerCase()}),
		);
		const {json} = await server.getJSON(`/api/scheduling/scheduledExecutions/${CHAIN_ID}/${checksummed}`);
		expect(json.executions.filter((v: any) => v.slot === slot)).toHaveLength(1);
	});
});

describe('execution', () => {
	const slot = 'slot-execution';

	beforeAll(async () => {
		const {status, json} = await server.postSigned('/api/execution/broadcastExecution', wallet, {
			chainId: CHAIN_ID,
			slot,
			transaction: {type: '0x2', gas: '0x5208', to: checksummed},
			maxFeePerGasAuthorized: '0x10',
			serviceParameters,
			onBehalf,
		});
		expect(json).toMatchObject({success: true});
		expect(status).toBe(200);
		expect(json.info.account).toEqual(lowercase);
		expect(json.info.onBehalf).toEqual(onBehalf.toLowerCase());
	});

	it('execution/:chainId/:account/:slot/:batchIndex finds the record from either form', async () => {
		const a = await server.getJSON(`/api/execution/execution/${CHAIN_ID}/${checksummed}/${slot}/0`);
		const b = await server.getJSON(`/api/execution/execution/${CHAIN_ID}/${lowercase}/${slot}/0`);
		expect(a.json.execution).toBeDefined();
		expect(a.json.execution.account).toEqual(lowercase);
		expect(b.json).toEqual(a.json);
	});

	it('rejects a batchIndex that is not an integer with a 400', async () => {
		const {status, json} = await server.getJSON(`/api/execution/execution/${CHAIN_ID}/${lowercase}/${slot}/abc`);
		expect(status).toBe(400);
		expect(json.success).toBe(false);
	});
});

describe('admin and dashboard', () => {
	const slot = 'slot-admin';

	beforeAll(async () => {
		const {json} = await server.postSigned('/api/scheduling/scheduleExecution', wallet, scheduledExecution(slot));
		expect(json).toMatchObject({success: true});
	});

	it('admin/account-submissions/:account lists the same records from either form', async () => {
		const a = await server.getJSON(`/admin/account-submissions/${checksummed}`);
		const b = await server.getJSON(`/admin/account-submissions/${lowercase}`);
		expect(a.json.queue.map((v: any) => v.slot)).toContain(slot);
		expect(b.json).toEqual(a.json);
	});

	it('dashboard account pages render the same from either form', async () => {
		for (const route of ['account-submissions', 'account-archived-submissions']) {
			const a = await server.request(`/dashboard/admin/${route}/${checksummed}`);
			const b = await server.request(`/dashboard/admin/${route}/${lowercase}`);
			expect(a.status).toBe(200);
			expect(await b.text()).toEqual(await a.text());
		}
		const a = await server.request(`/dashboard/admin/unfinalized-submissions/${CHAIN_ID}/${getAddress(broadcaster)}`);
		const b = await server.request(`/dashboard/admin/unfinalized-submissions/${CHAIN_ID}/${broadcaster}`);
		expect(a.status).toBe(200);
		expect(await b.text()).toEqual(await a.text());
	});

	it('admin/archiveSubmission/:chainId/:account/:slot reaches the record from the checksummed form', async () => {
		const {json} = await server.getJSON(`/admin/archiveSubmission/${CHAIN_ID}/${checksummed}/${slot}`, {
			method: 'POST',
			headers: server.adminHeaders,
		});
		expect(json).toEqual({success: true});
		const after = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${lowercase}/${slot}`);
		expect(after.json.execution).toBeUndefined();
	});
});

describe('invalid addresses', () => {
	it('rejects a path address that is not hex with a 400', async () => {
		for (const account of ['0xZZ', 'abcdef', '0x12 34']) {
			const {status, json} = await server.getJSON(
				`/api/scheduling/scheduledExecutions/${CHAIN_ID}/${encodeURIComponent(account)}`,
			);
			expect(status).toBe(400);
			expect(json.success).toBe(false);
		}
	});

	it('rejects a body address that is not hex with a 400', async () => {
		const {status, json} = await server.postSigned(
			'/api/scheduling/scheduleExecution',
			wallet,
			scheduledExecution('slot-invalid', {onBehalf: '0xnot-hex'}),
		);
		expect(status).toBe(400);
		expect(json.success).toBe(false);
	});
});

describe('existing rows written before normalisation', () => {
	it('are lowercased by setup and then found from either form', async () => {
		const slot = 'slot-legacy';
		const {json} = await server.postSigned('/api/scheduling/scheduleExecution', wallet, scheduledExecution(slot));
		expect(json).toMatchObject({success: true});
		// simulate a row stored by a previous version: account checksummed, as `auth` used to store it
		await server.db.execute({
			sql: 'UPDATE ScheduledExecutions SET account = ?1, onBehalf = ?2 WHERE slot = ?3',
			args: [checksummed, onBehalf, slot],
		});
		const before = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${checksummed}/${slot}`);
		expect(before.json.execution).toBeUndefined();

		const setup = await server.getJSON('/admin/setup', {headers: server.adminHeaders});
		expect(setup.json).toEqual({success: true});

		for (const account of [checksummed, lowercase]) {
			const after = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${account}/${slot}`);
			expect(after.json.execution.account).toEqual(lowercase);
			expect(after.json.execution.onBehalf).toEqual(onBehalf.toLowerCase());
		}
	});
});

describe('compatibility with deployed clients', () => {
	it('accepts the time-locked body fuzd-client 0.10.1 sends for conquest.eth reveals', async () => {
		// the exact shape fuzd-client@0.10.1 builds (`scheduleExecution`, time-locked branch), with the
		// values conquest.eth passes: a checksummed `from` in startTransaction, a lowercase onBehalf, the
		// remote account (lowercase, from the server) as paymentReserve.broadcaster. A field the server
		// does not know about is dropped rather than rejected.
		const now = Math.floor(Date.now() / 1000);
		const body = {
			chainId: CHAIN_ID,
			slot: '0x7b8c1b5d2a3e4f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8',
			timing: {
				type: 'delta-time-with-target-time',
				expiryDelta: 3960,
				delta: 1800,
				targetTimeUnlessHigherDelta: now + 3600,
				startTransaction: {
					broadcastTime: now,
					from: checksummed,
					hash: `0x${'ab'.repeat(32)}`,
					nonce: '0x2a',
				},
			},
			unknownField: 'dropped',
			executionServiceParameters: serviceParameters,
			paymentReserve: {amount: '100000000000000', broadcaster},
			onBehalf: lowercase,
			type: 'time-locked',
			payload: 'age-encryption.org/v1\n-> tlock 12345678 52db9ba7\nopaque',
		};
		const {status, json} = await server.postSigned('/api/scheduling/scheduleExecution', wallet, body);
		expect(json).toMatchObject({success: true, info: {chainId: CHAIN_ID, account: lowercase, slot: body.slot}});
		expect(status).toBe(200);
		expect(typeof json.signature).toBe('string');

		const stored = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${checksummed}/${body.slot}`);
		expect(stored.json.execution.timing.startTransaction.from).toEqual(lowercase);
		expect(stored.json.execution.unknownField).toBeUndefined();
		expect(stored.json.execution.payload).toEqual(body.payload);
	});
});

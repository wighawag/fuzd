import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {timelockDecrypt} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {createClient} from '../src/index.js';
import {createFakeDrand} from './utils/fake-drand.js';
import {CHAIN_ID, FUZD_URL, createTestServer} from './utils/server.js';

const privateKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
const signer = privateKeyToAccount(privateKey).address.toLowerCase();

// three distinct transactions, so an order change shows
const batch = [
	{to: '0x000000000000000000000000000000000000aa01', data: '0x01', gas: 100_000n},
	{to: '0x000000000000000000000000000000000000aa02', data: '0x0202', gas: 200_000, value: 7n},
	{to: '0x000000000000000000000000000000000000aa03', data: '0x030303', gas: '0x493e0'},
] as const;
const batchOnTheWire = [
	{to: '0x000000000000000000000000000000000000aa01', data: '0x01', gas: '0x186a0', type: '0x2'},
	{to: '0x000000000000000000000000000000000000aa02', data: '0x0202', gas: '0x30d40', type: '0x2', value: '0x7'},
	{to: '0x000000000000000000000000000000000000aa03', data: '0x030303', gas: '0x493e0', type: '0x2'},
];

let server: Awaited<ReturnType<typeof createTestServer>>;
const drand = createFakeDrand();
const client = createClient({privateKey, schedulerEndPoint: FUZD_URL, drand});
let broadcaster: `0x${string}`;
let serviceParameters: unknown;

function scheduledTime() {
	return Math.floor(Date.now() / 1000) + 3600;
}

beforeAll(async () => {
	server = await createTestServer();
	const account = await client.assignRemoteAccount(CHAIN_ID);
	broadcaster = account.address;
	serviceParameters = account.serviceParameters;
});

afterAll(() => {
	server?.close();
});

async function stored(slot: string) {
	const json = await server.getJSON(`/api/scheduling/scheduledExecution/${CHAIN_ID}/${signer}/${slot}`);
	expect(json.success).toBe(true);
	return json.execution;
}

describe('the one-transaction form', () => {
	it('is unchanged on the wire', async () => {
		const time = scheduledTime();
		const result = await client.scheduleExecution({
			slot: 'single',
			chainId: CHAIN_ID,
			transaction: {to: '0x000000000000000000000000000000000000bb01', data: '0xabcd', gas: 21000n, value: 3n},
			maxFeePerGasAuthorized: 100n,
			criticalDelta: 60,
			timing: {type: 'fixed-time', scheduledTime: time, expiryDelta: 600},
			paymentReserve: {amount: 12345n, broadcaster},
			inClear: true,
		});
		expect(result.success).toBe(true);

		// the exact string @fuzd/client 0.11.4 sends, key order included (the signature is over it)
		const expected = JSON.stringify({
			chainId: CHAIN_ID,
			slot: 'single',
			timing: {type: 'fixed-time', scheduledTime: time, expiryDelta: 600},
			executionServiceParameters: serviceParameters,
			paymentReserve: {amount: '12345', broadcaster},
			type: 'clear',
			executions: [
				{
					chainId: CHAIN_ID,
					maxFeePerGasAuthorized: '0x64',
					transaction: {
						gas: '0x5208',
						type: '0x2',
						data: '0xabcd',
						to: '0x000000000000000000000000000000000000bb01',
						value: '0x3',
					},
					criticalDelta: 60,
				},
			],
		});
		const sent = server.scheduleRequests.at(-1)!;
		expect(sent.body).toEqual(expected);
		expect(await privateKeyToAccount(privateKey).signMessage({message: expected})).toEqual(sent.signature);
	});
});

describe('a batch of transactions', () => {
	it('reaches the scheduler in order, in clear', async () => {
		const result = await client.scheduleExecution({
			slot: 'batch-clear',
			chainId: CHAIN_ID,
			transactions: [...batch],
			maxFeePerGasAuthorized: 100n,
			timing: {type: 'fixed-time', scheduledTime: scheduledTime()},
			paymentReserve: {amount: 1n, broadcaster},
			inClear: true,
		});
		expect(result).toMatchObject({success: true});

		const sent = JSON.parse(server.scheduleRequests.at(-1)!.body);
		expect(sent.type).toBe('clear');
		expect(sent.paymentReserve).toEqual({amount: '1', broadcaster});
		expect(sent.executions.map((v: any) => v.transaction)).toEqual(batchOnTheWire);
		// the submission's price applies to every transaction of the batch
		expect(sent.executions.map((v: any) => [v.chainId, v.maxFeePerGasAuthorized])).toEqual(
			batch.map(() => [CHAIN_ID, '0x64']),
		);

		const execution = await stored('batch-clear');
		expect(execution.type).toBe('clear');
		expect(execution.executions.map((v: any) => v.transaction)).toEqual(batchOnTheWire);
	});

	it('reaches the scheduler in order, time-locked, and decrypts back to the same ordered list', async () => {
		const result = await client.scheduleExecution(
			{
				slot: 'batch-time-locked',
				chainId: CHAIN_ID,
				transactions: [...batch],
				maxFeePerGasAuthorized: 100n,
				timing: {type: 'fixed-time', scheduledTime: scheduledTime()},
			},
			// encrypt for the current round, so the fake network can decrypt it now
			{fakeEncrypt: true},
		);
		expect(result).toMatchObject({success: true});

		const sent = JSON.parse(server.scheduleRequests.at(-1)!.body);
		expect(sent.type).toBe('time-locked');
		expect(sent.executions).toBeUndefined();

		const execution = await stored('batch-time-locked');
		expect(execution.type).toBe('time-locked');
		const decrypted = JSON.parse((await timelockDecrypt(execution.payload, drand)).toString('utf-8'));
		expect(decrypted.type).toBe('clear');
		expect(decrypted.executions.map((v: any) => v.transaction)).toEqual(batchOnTheWire);
		expect(decrypted.executions.map((v: any) => v.maxFeePerGasAuthorized)).toEqual(batch.map(() => '0x64'));
	});

	it('refuses an empty list, and both forms at once', async () => {
		const common = {
			chainId: CHAIN_ID,
			maxFeePerGasAuthorized: 100n,
			timing: {type: 'fixed-time', scheduledTime: scheduledTime()} as const,
			inClear: true,
		};
		await expect(client.scheduleExecution({...common, slot: 'empty', transactions: []})).rejects.toThrow(
			/at least one transaction/,
		);
		await expect(
			client.scheduleExecution({
				...common,
				slot: 'both',
				transaction: batch[0],
				transactions: [...batch],
			} as any),
		).rejects.toThrow(/either/);
	});
});

describe('the payment for a batch', () => {
	beforeAll(async () => {
		await server.updateFees({fixed: '1000', per_1_000_000: 10_000}); // 1000 wei and 1% per transaction
		await client.assignRemoteAccount(CHAIN_ID); // the fees are part of the remote account's service parameters
	});

	it('is the sum of every transaction, each paying its own fees', () => {
		const maxFeePerGasAuthorized = 10n;
		const one = (gas: bigint, value = 0n) => gas * 10n + 1000n + (gas * 10n * 10_000n) / 1_000_000n + value;
		expect(client.computeTotalMaxCost({maxFeePerGasAuthorized, gas: 100_000n})).toEqual(one(100_000n));
		expect(client.computeTotalMaxCost({maxFeePerGasAuthorized, transactions: [...batch]})).toEqual(
			one(100_000n) + one(200_000n, 7n) + one(300_000n),
		);
		expect(client.computeTotalMaxCost({maxFeePerGasAuthorized, transactions: [batch[0]]})).toEqual(
			client.computeTotalMaxCost({maxFeePerGasAuthorized, gas: 100_000n}),
		);
	});

	it('counts what other slots reserve, for a batch too', async () => {
		const maxFeePerGasAuthorized = 10n;
		const required = await client.computeBalanceRequired({
			slot: 'another-slot',
			chainId: CHAIN_ID,
			maxFeePerGasAuthorized,
			transactions: [...batch],
		});
		const totalMaxCost = client.computeTotalMaxCost({maxFeePerGasAuthorized, transactions: [...batch]});
		// the earlier tests reserved 12345 (slot "single") and 1 (slot "batch-clear")
		expect(required).toEqual({amountReserved: 12346n, totalMaxCost, balanceRequired: 12346n + totalMaxCost});
	});
});

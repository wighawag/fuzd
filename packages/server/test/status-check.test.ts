import {afterEach, describe, expect, it, vi} from 'vitest';
import {RemoteSQLSchedulerStorage} from '../src/storage/RemoteSQLSchedulerStorage.js';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';

// checkScheduledExecutionStatus marks a broadcast execution finalized once the executor has
// finalized its transactions. It read the 10 oldest unfinalized broadcast executions of every chain
// at once, two statements each: the rows of a chain no longer configured (never finalized, since
// processTransactions only works on configured chains), or simply the executions not final yet,
// took every place, and nothing behind them was finalized; and one execution whose status could not
// be read made the whole run fail.

let server: TestServer | undefined;
afterEach(() => {
	server?.close();
	server = undefined;
});

const OTHER_CHAIN_ID = '31338';
// the same mock node as CHAIN_ID
const OTHER_CHAIN = 'http://fuzd-test-rpc.invalid/#finality=1&worstCaseBlockTime=2';

async function schedule(s: TestServer, chainId: string, prefix: string, count: number, time: number) {
	for (let i = 0; i < count; i++) {
		const wallet = privateKeyToAccount(keccak256(toHex(`${prefix}-${i}`)));
		const {json: remote} = await s.getJSON(`/api/execution/remoteAccount/${chainId}/${wallet.address}`);
		expect(remote.success).toBe(true);
		const {json} = await s.postSigned('/api/scheduling/scheduleExecution', wallet, {
			type: 'clear',
			chainId,
			slot: 'reveal',
			timing: {type: 'fixed-time', scheduledTime: time},
			executions: [
				{
					chainId,
					transaction: {type: '0x2', gas: '0x5208', to: remote.account.address},
					maxFeePerGasAuthorized: '0x10',
				},
			],
			executionServiceParameters: remote.account.serviceParameters,
		});
		expect(json).toMatchObject({success: true});
	}
}

async function waitUntil(time: number) {
	const wait = (time + 1) * 1000 - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function run(s: TestServer, action: string) {
	const {status, json} = await s.getJSON(`/internal/${action}`, {headers: s.adminHeaders});
	return {status, json};
}

/** what processTransactions does once a transaction is final: here by hand, the mock RPC has no receipts */
async function finalizeTransactions(s: TestServer, chainId: string) {
	await s.db.execute({sql: 'UPDATE BroadcastedExecutions SET finalized = 1 WHERE chainId = ?', args: [chainId]});
}

async function finalizedPerChain(s: TestServer) {
	const {rows} = await s.db.execute(
		'SELECT chainId, sum(finalized) AS finalized, count(*) AS total FROM ScheduledExecutions GROUP BY chainId ORDER BY chainId',
	);
	return Object.fromEntries(rows.map((v: any) => [v.chainId, `${v.finalized}/${v.total}`]));
}

describe('checkScheduledExecutionStatus', () => {
	it('finalizes the executions of configured chains, whatever the rows of a chain no longer configured', async () => {
		server = await createTestServer({[`CHAIN_${OTHER_CHAIN_ID}`]: OTHER_CHAIN});
		const time = Math.floor(Date.now() / 1000) + 5;
		// older than the others, and more than one run looks at
		await schedule(server, OTHER_CHAIN_ID, 'gone', 12, time);
		await schedule(server, CHAIN_ID, 'here', 3, time + 1);
		await waitUntil(time + 1);
		expect((await run(server, 'processQueue')).json.result.executions).toHaveLength(15);
		await finalizeTransactions(server, CHAIN_ID);

		delete server.env[`CHAIN_${OTHER_CHAIN_ID}`];
		const {status} = await run(server, 'checkScheduledExecutionStatus');

		expect(status).toBe(200);
		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '3/3', [OTHER_CHAIN_ID]: '0/12'});
	});

	it('looks past the executions not final yet, in a few statements', async () => {
		// one batch of 45 (the default batch size is 50): more slots than one statement binds
		server = await createTestServer();
		const time = Math.floor(Date.now() / 1000) + 5;
		// not final yet, older than the others (they used to take every place of every run), and newer
		// (the last ones, read in the second statement of the transactions' read)
		await schedule(server, CHAIN_ID, 'pending', 6, time);
		await schedule(server, CHAIN_ID, 'final', 33, time + 1);
		await schedule(server, CHAIN_ID, 'pending-later', 6, time + 2);
		await waitUntil(time + 2);
		expect((await run(server, 'processQueue')).json.result.executions).toHaveLength(45);
		const final = Array.from({length: 33}, (_, i) =>
			privateKeyToAccount(keccak256(toHex(`final-${i}`))).address.toLowerCase(),
		);
		for (const account of final) {
			await server.db.execute({
				sql: 'UPDATE BroadcastedExecutions SET finalized = 1 WHERE account = ?',
				args: [account],
			});
		}

		const before = server.dbStats.statements;
		const {status, json} = await run(server, 'checkScheduledExecutionStatus');
		const statements = server.dbStats.statements - before;

		expect(status).toBe(200);
		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '33/45'});
		expect(json.result.executions).toHaveLength(45);
		expect(json.result.budgetExhausted).toBe(false);
		// a read of the scheduled executions, a read of their transactions (two statements: 40 slots
		// at most per statement) and a write, not two statements per execution
		expect(statements).toBeLessThanOrEqual(6);
	});

	it('says when it stopped on its budget', async () => {
		server = await createTestServer({PROCESSING_BATCH_SIZE: '2', STATUS_CHECK_MAX_PER_RUN: '4'});
		const time = Math.floor(Date.now() / 1000) + 5;
		await schedule(server, CHAIN_ID, 'many', 6, time);
		await waitUntil(time);
		await run(server, 'processQueue');
		await finalizeTransactions(server, CHAIN_ID);

		const first = await run(server, 'checkScheduledExecutionStatus');
		expect(first.json.result.budgetExhausted).toBe(true);
		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '4/6'});
		const second = await run(server, 'checkScheduledExecutionStatus');
		expect(second.json.result.budgetExhausted).toBe(false);
		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '6/6'});
	});

	it('gives each chain its own share of the run', async () => {
		server = await createTestServer({
			[`CHAIN_${OTHER_CHAIN_ID}`]: OTHER_CHAIN,
			PROCESSING_BATCH_SIZE: '2',
			STATUS_CHECK_MAX_PER_RUN: '4',
		});
		const time = Math.floor(Date.now() / 1000) + 5;
		// the first chain looked at has more executions not final yet than a run looks at
		await schedule(server, CHAIN_ID, 'waiting', 6, time);
		await schedule(server, OTHER_CHAIN_ID, 'final', 2, time);
		await waitUntil(time);
		await run(server, 'processQueue');
		await finalizeTransactions(server, OTHER_CHAIN_ID);

		const {json} = await run(server, 'checkScheduledExecutionStatus');

		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '0/6', [OTHER_CHAIN_ID]: '2/2'});
		// nothing final among what it looked at on the first chain: running again at once would not help
		expect(json.result.budgetExhausted).toBe(false);
	});

	it('goes on past a batch whose check fails', async () => {
		server = await createTestServer({PROCESSING_BATCH_SIZE: '2'});
		const time = Math.floor(Date.now() / 1000) + 5;
		await schedule(server, CHAIN_ID, 'failing', 2, time);
		await schedule(server, CHAIN_ID, 'fine', 2, time + 1);
		await waitUntil(time + 1);
		expect((await run(server, 'processQueue')).json.result.executions).toHaveLength(4);
		await finalizeTransactions(server, CHAIN_ID);
		// the first batch's write fails (a database error, say)
		const write = vi
			.spyOn(RemoteSQLSchedulerStorage.prototype, 'markExecutionsFinalized')
			.mockRejectedValueOnce(new Error('database is locked'));
		try {
			const {status, json} = await run(server, 'checkScheduledExecutionStatus');

			expect(status).toBe(200);
			expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '2/4'});
			const failing = json.result.executions.filter((v: any) => v.status.type === 'unknown');
			expect(failing).toHaveLength(2);
			expect(failing[0].status.reason).toMatch(/database is locked/);
		} finally {
			write.mockRestore();
		}
		// looked at again at the next run
		await run(server, 'checkScheduledExecutionStatus');
		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '4/4'});
	});
});

import {afterEach, describe, expect, it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';

// checkScheduledExecutionStatus marks a broadcast execution finalized once the executor has
// finalized its transactions. It read the oldest unfinalized broadcast executions of every chain at
// once, so the rows of a chain no longer configured (never finalized, since processTransactions
// only works on configured chains) took every place and nothing else was ever finalized; and one
// execution whose status could not be read made the whole run fail.

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

	it('goes on past an execution whose status cannot be read', async () => {
		server = await createTestServer();
		const time = Math.floor(Date.now() / 1000) + 5;
		await schedule(server, CHAIN_ID, 'broken', 1, time);
		await schedule(server, CHAIN_ID, 'fine', 3, time + 1);
		await waitUntil(time + 1);
		expect((await run(server, 'processQueue')).json.result.executions).toHaveLength(4);
		await finalizeTransactions(server, CHAIN_ID);
		// the first one looked at: its stored transaction no longer parses
		const broken = privateKeyToAccount(keccak256(toHex('broken-0'))).address.toLowerCase();
		await server.db.execute({
			sql: `UPDATE BroadcastedExecutions SET transactionData = 'not json' WHERE account = ?`,
			args: [broken],
		});

		const {status, json} = await run(server, 'checkScheduledExecutionStatus');

		expect(status).toBe(200);
		expect(await finalizedPerChain(server)).toEqual({[CHAIN_ID]: '3/4'});
		const reported = json.result.executions.find((v: any) => v.account === broken);
		expect(reported.status.type).toBe('unknown');
		expect(reported.status.reason).toMatch(/JSON/);
	});
});

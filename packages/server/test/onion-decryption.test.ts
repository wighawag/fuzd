import {afterEach, describe, expect, it, vi} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';
import {timelockEncrypt, Buffer} from 'tlock-js';
import {initDecrypter} from '@fuzd/tlock-decrypter';
import {CHAIN_ID, createTestServer, type TestServer} from './utils/server.js';
import {createFakeDrand} from './utils/fake-drand.js';

// A twice time-locked ("onion") execution: the payload decrypted at the first round is itself
// time-locked, for a later round, with its own timing. The scheduler must keep the inner layer and
// its timing, wait for the second round, and broadcast the inner transaction once.
// The drand network is a fake one (offline), which refuses a round whose time has not come, and the
// clock is faked (Date only) so the test does not wait for rounds to pass.

let server: TestServer | undefined;
afterEach(() => {
	server?.close();
	server = undefined;
	vi.useRealTimers();
});

async function processQueue(s: TestServer) {
	const {status, json} = await s.getJSON('/internal/processQueue', {headers: s.adminHeaders});
	expect(status).toBe(200);
	return json;
}

function sentTransactions(s: TestServer) {
	return s.rpc.calls.filter((v) => v.method === 'eth_sendRawTransaction');
}

async function row(s: TestServer) {
	const {rows} = await s.db.execute(
		'SELECT broadcasted, nextCheckTime, payload, timing, retries, lastError FROM ScheduledExecutions',
	);
	expect(rows.length).toBe(1);
	const r = rows[0] as any;
	return {...r, timing: JSON.parse(r.timing)};
}

describe('an onion (twice time-locked) execution', () => {
	it.each([
		{innerExpiryDelta: 3600, expectedExpiryDelta: 3600, case: 'its own expiryDelta'},
		{innerExpiryDelta: undefined, expectedExpiryDelta: 900, case: 'the outer expiryDelta when it has none'},
		{innerExpiryDelta: 0, expectedExpiryDelta: 900, case: 'the outer expiryDelta when its own is 0'},
	])(
		'broadcasts the inner transaction once both rounds have passed, expiring from the inner timing with $case',
		async ({innerExpiryDelta, expectedExpiryDelta}) => {
			vi.useFakeTimers({toFake: ['Date']});
			const start = Math.floor(Date.now() / 1000);
			vi.setSystemTime(start * 1000);

			const drand = createFakeDrand();
			server = await createTestServer({TIME_LOCK_DECRYPTION: 'true'}, {drand});

			const wallet = privateKeyToAccount(keccak256(toHex('onion')));
			const {json: remote} = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${wallet.address}`);
			expect(remote.success).toBe(true);

			const outerTime = start + 60;
			const innerTime = start + 1200;
			const innerRound = drand.roundAt(innerTime);
			const innerRoundTime = drand.roundTime(innerRound);
			const outerRound = drand.roundAt(outerTime);

			const inner = await timelockEncrypt(
				innerRound,
				Buffer.from(
					JSON.stringify({
						type: 'clear',
						executions: [
							{
								chainId: CHAIN_ID,
								transaction: {type: '0x2', gas: '0x5208', to: '0x000000000000000000000000000000000000c0de'},
								maxFeePerGasAuthorized: '0x10',
							},
						],
					}),
					'utf-8',
				),
				drand,
			);
			const outer = await timelockEncrypt(
				outerRound,
				Buffer.from(
					JSON.stringify({
						type: 'time-locked',
						payload: inner,
						timing: {
							type: 'fixed-round',
							scheduledRound: innerRound,
							expectedTime: innerRoundTime,
							expiryDelta: innerExpiryDelta,
						},
					}),
					'utf-8',
				),
				drand,
			);

			// the outer timing (scheduled at outerTime) expires long before the inner time: once peeled, the
			// expiry counts from the inner timing's time
			const {json: scheduled} = await server.postSigned('/api/scheduling/scheduleExecution', wallet, {
				type: 'time-locked',
				chainId: CHAIN_ID,
				slot: 'onion',
				timing: {type: 'fixed-time', scheduledTime: outerTime, expiryDelta: 900},
				payload: outer,
				executionServiceParameters: remote.account.serviceParameters,
			});
			expect(scheduled).toMatchObject({success: true});

			// before the first round: nothing
			vi.setSystemTime((outerTime - 5) * 1000);
			await processQueue(server);
			expect(sentTransactions(server).length).toBe(0);

			// the first round passed: the outer layer is peeled, the inner payload and timing are kept
			vi.setSystemTime((drand.roundTime(outerRound) + 1) * 1000);
			await processQueue(server);
			expect(sentTransactions(server).length).toBe(0);
			const peeled = await row(server);
			expect(peeled.broadcasted).toBe(0);
			expect(peeled.lastError).toBeNull();
			expect(peeled.payload).toEqual(inner);
			expect(peeled.timing).toMatchObject({type: 'fixed-round', scheduledRound: innerRound});
			expect(peeled.nextCheckTime).toBe(innerRoundTime);

			// past the outer expiry, before the inner round: still waiting, not archived
			vi.setSystemTime((outerTime + 900 + 100) * 1000);
			await processQueue(server);
			expect(sentTransactions(server).length).toBe(0);
			expect((await row(server)).broadcasted).toBe(0);

			// the second round passed: the inner transaction goes out, once
			vi.setSystemTime((innerRoundTime + 1) * 1000);
			await processQueue(server);
			const sent = sentTransactions(server);
			expect(sent.length).toBe(1);
			expect((await row(server)).broadcasted).toBe(1);

			// and the executor's expiry counts from the inner timing
			const {rows} = await server.db.execute('SELECT expiryTime FROM BroadcastedExecutions');
			expect(rows.map((v: any) => v.expiryTime)).toEqual([innerRoundTime + expectedExpiryDelta]);

			await processQueue(server);
			expect(sentTransactions(server).length).toBe(1);
		},
	);
});

describe('the tlock decrypter, on an onion layer', () => {
	it('waits for the round of a delta-time-with-target-time inner timing at its target time', async () => {
		const drand = createFakeDrand();
		const now = Math.floor(Date.now() / 1000);
		const targetTime = now + 1000;
		const innerTiming = {
			type: 'delta-time-with-target-time',
			startTransaction: {from: `0x${'11'.repeat(20)}`, hash: `0x${'22'.repeat(32)}`, nonce: '0x0', broadcastTime: now},
			delta: 10,
			targetTimeUnlessHigherDelta: targetTime,
		};
		const outer = await timelockEncrypt(
			drand.roundAt(now - 10),
			Buffer.from(JSON.stringify({type: 'time-locked', payload: 'inner', timing: innerTiming}), 'utf-8'),
			drand,
		);
		const result = await initDecrypter<any>({client: drand}).decrypt({
			type: 'time-locked',
			payload: outer,
			timing: {type: 'fixed-time', scheduledTime: now - 10},
		} as any);
		// the target time's round, not the target time read as a round number
		expect(result).toEqual({
			success: false,
			newPayload: 'inner',
			newTiming: innerTiming,
			retry: drand.roundTime(drand.roundAt(targetTime)),
		});
	});

	it('refuses an inner timing that cannot be time-locked', async () => {
		const drand = createFakeDrand();
		const now = Math.floor(Date.now() / 1000);
		const outer = await timelockEncrypt(
			drand.roundAt(now - 10),
			Buffer.from(JSON.stringify({type: 'time-locked', payload: 'inner', timing: {type: 'delta-time'}}), 'utf-8'),
			drand,
		);
		await expect(
			initDecrypter<any>({client: drand}).decrypt({
				type: 'time-locked',
				payload: outer,
				timing: {type: 'fixed-time', scheduledTime: now - 10},
			} as any),
		).rejects.toThrow(/delta-time/);
	});
});

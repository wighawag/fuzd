import {describe, it, expect, assert, beforeAll} from 'vitest';

import {connectToWorker} from './external-worker';
import {createClient} from 'fuzd-client';
import {ANVIL_URL, FUZD_URL} from './prool/pool';

const worker = connectToWorker();

describe('with client', () => {
	// --------------------------------------------------------------------------------------------
	// wakeup worker
	//   the first time the worker is called, it setups itself and this can take time
	//   We also call setChainOverride to ensure the api is talking to the proper eth node
	// --------------------------------------------------------------------------------------------
	beforeAll(async () => {
		await worker.fetch(
			`/admin/setChainOverride/31337/${encodeURIComponent(`${ANVIL_URL}#finality=2&worstCaseBlockTime=5`)}`,
		);
	}, 10000);

	it('should be able to submit a scheduled transaction', async function () {
		const client = createClient({
			privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
			schedulerEndPoint: FUZD_URL,
		});

		const chainId = `31337`;

		const remoteAccount = client.assignRemoteAccount(chainId);
		// we can now send fund to remoteAccount.address
		// if you do not, the scheduled transaction will be still scheduled
		// but it will fails when execution as no fund will be there to pay for the tx

		const executionTime = Math.floor(Date.now() / 1000) + 10;
		const result = await client.scheduleExecution({
			slot: 'test',
			chainId,
			maxFeePerGasAuthorized: 1n,
			time: executionTime,
			transaction: {
				gas: 10000n,
			},
		});

		expect(result.success).toBe(true);
		assert(result.success);
		expect(result.info.chainId).to.equal(chainId);
		expect(result.info.checkinTime).toBeGreaterThanOrEqual(executionTime);
	});
});

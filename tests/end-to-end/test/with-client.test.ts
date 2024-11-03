import {describe, it, expect, assert} from 'vitest';

import {connectToWorker} from './external-worker';
import {createClient} from 'fuzd-client';
import {WORKER_URL} from './prool/pool';

const worker = connectToWorker();

describe('with client', () => {
	// --------------------------------------------------------------------------------------------
	// wakeup worker
	//   the first time the worker is called, it setups itself and this can take time
	//   hence we have a dummy test to ensure the other tests have normal timeout
	// --------------------------------------------------------------------------------------------
	it('startup', {timeout: 10000}, async () => {
		await worker.fetch('/');
	});
	// --------------------------------------------------------------------------------------------

	it('should be able to submit a scheduled transaction', async function () {
		const client = createClient({
			privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
			schedulerEndPoint: WORKER_URL,
		});

		const chainId = `0x7a69`;

		const remoteAccount = client.assignRemoteAccount(chainId);
		// we can now send fund to remoteAccount.address

		const result = await client.scheduleExecution({
			chainId,
			maxFeePerGasAuthorized: 1n,
			time: Math.floor(Date.now() / 1000) + 10,
			transaction: {
				gas: 10000n,
			},
		});

		expect(result.success).toBe(true);
		assert(result.success);
		expect(result.info.chainId).to.equal(chainId);
	});
});

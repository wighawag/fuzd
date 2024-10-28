import {describe, it, expect} from 'vitest';

import {createClient} from 'fuzd-server';
import {WORKER_URL} from './prool/pool';

const client = createClient(WORKER_URL);

describe('fuzd api via hono client', () => {
	// --------------------------------------------------------------------------------------------
	// wakup worker
	// --------------------------------------------------------------------------------------------
	it('startup', {timeout: 10000}, async () => {
		await client.index.$get();
	});
	// --------------------------------------------------------------------------------------------

	it(`fuzd-api`, async () => {
		const publicKey = await (await client.api.publicKey.$get()).text();
		expect(publicKey).toBeTypeOf('string');
		expect(publicKey.length).toBeGreaterThan(0);
	});

	it(`schedule`, async () => {
		const response = await client.api.scheduling.scheduleExecution.$post({
			json: {
				type: 'clear',
				chainId: '0x1',
				executions: [
					{
						chainId: '0x1',
						derivationParameters: {data: '', type: 'ethereum'}, // TODO
						maxFeePerGasAuthorized: '0x0', // TODO
						transaction: {
							type: '0x2',
							gas: '0x0', // TODO
						},
					},
				],
				slot: '',
				timing: {
					type: 'fixed-time',
					scheduledTime: 1000,
				},
			},
		});
		expect(response.ok).toBe(false);
		console.log(JSON.stringify(await response.json()));
	});
});

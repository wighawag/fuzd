import {TransactionSubmission} from 'fuzd-executor';
import {ScheduledExecution} from 'fuzd-scheduler';
import {deriveRemoteAddress} from 'remote-account';
import {describe, beforeAll, it, expect, afterAll} from 'vitest';
import {unstable_dev} from 'wrangler';
import type {UnstableDevWorker} from 'wrangler';
import {privateKeyToAccount} from 'viem/accounts';

const schedulerEndPoint = `http://localhost`;

describe('Worker', () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev('src/index.ts', {
			experimental: {disableExperimentalWarning: true},
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it('should return fuzd api', async function () {
		const resp = await worker.fetch();
		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"fuzd api"`);
	});

	it('should', async function () {
		const wallet = privateKeyToAccount('0x1111111111111111111111111111111111111111111111111111111111111111');
		const publicKey = await worker.fetch(`${schedulerEndPoint}/publicKey`).then((v) => v.text());
		const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);
		const chainIdAsHex = `0x7a69`; // lower case only// TODO

		const tx: TransactionSubmission = {
			gas: `0x1000000`,
			chainId: chainIdAsHex,
			type: '0x2',
			broadcastSchedule: [
				{
					duration: `0x10`,
					maxFeePerGas: `0x10`,
					maxPriorityFeePerGas: `0x10`,
				},
			],
		};

		const fuzdExecution: ScheduledExecution<TransactionSubmission> = {
			type: 'clear',
			chainId: chainIdAsHex,
			slot: `any`,
			timing: {
				type: 'fixed',
				value: {
					type: 'round',
					expectedTime: 100000000000,
					round: 2,
				},
			},
			transaction: tx,
		};

		const jsonAsString = JSON.stringify(fuzdExecution);
		const signature = await wallet.signMessage({message: jsonAsString});

		const resp = await worker.fetch(`${schedulerEndPoint}/scheduleExecution`, {
			body: jsonAsString,
			headers: {
				'content-type': 'application/json',
				signature,
			},
			method: 'POST',
		});
		const json: any = await resp.json();
		expect(json.chainId).to.equal(chainIdAsHex);
	});
});

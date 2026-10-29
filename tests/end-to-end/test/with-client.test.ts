import {describe, it, expect, assert, beforeAll} from 'vitest';

import {connectToWorker} from './external-worker';
import {createClient} from '@fuzd/client';
import {privateKeyToAccount} from 'viem/accounts';
import {fund, rpc} from './anvil-rpc';
import {ADMIN_HEADERS, ANVIL_URL, FUZD_URL} from './prool/pool';

const worker = connectToWorker();

describe('with client', () => {
	// --------------------------------------------------------------------------------------------
	// wakeup worker
	//   the first time the worker is called, it setups itself and this can take time
	//   We also call setChainOverride to ensure the api is talking to the proper eth node
	// --------------------------------------------------------------------------------------------
	beforeAll(async () => {
		const response = await worker.fetch(
			`/admin/setChainOverride/31337/${encodeURIComponent(`${ANVIL_URL}#finality=2&worstCaseBlockTime=5`)}`,
			{headers: ADMIN_HEADERS},
		);
		expect(await response.json()).toEqual({success: true});
	}, 10000);

	it('should be able to submit a scheduled transaction', async function () {
		const client = createClient({
			privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
			schedulerEndPoint: FUZD_URL,
		});

		const chainId = `31337`;

		const remoteAccount = await client.assignRemoteAccount(chainId);
		// we can now send fund to remoteAccount.address
		// if you do not, the scheduled transaction will be still scheduled
		// but it will fails when execution as no fund will be there to pay for the tx

		const executionTime = Math.floor(Date.now() / 1000) + 10;
		const result = await client.scheduleExecution({
			slot: 'test',
			chainId,
			maxFeePerGasAuthorized: 1n,
			timing: {type: 'fixed-time', scheduledTime: executionTime},
			transaction: {
				to: remoteAccount.address,
				gas: 21000n,
			},
			inClear: true,
		});

		expect(result.success).toBe(true);
		assert(result.success);
		expect(result.info.chainId).to.equal(chainId);
		expect(result.info.checkinTime).toBeGreaterThanOrEqual(executionTime);
	});

	it('broadcasts a batch in order, from one remote account, at its time', async function () {
		const privateKey = '0x2222222222222222222222222222222222222222222222222222222222222222';
		const signer = privateKeyToAccount(privateKey).address.toLowerCase();
		const client = createClient({privateKey, schedulerEndPoint: FUZD_URL});
		const chainId = `31337`;
		const remoteAccount = await client.assignRemoteAccount(chainId);
		await fund(remoteAccount.address);

		const recipients = [
			'0x00000000000000000000000000000000000b0001',
			'0x00000000000000000000000000000000000b0002',
			'0x00000000000000000000000000000000000b0003',
		] as const;
		const slot = 'batch';
		const block = await rpc('eth_getBlockByNumber', ['latest', false]);
		const result = await client.scheduleExecution({
			slot,
			chainId,
			maxFeePerGasAuthorized: 10_000_000_000n,
			timing: {type: 'fixed-time', scheduledTime: Number(block.timestamp)},
			transactions: recipients.map((to, i) => ({to, gas: 21000n, value: BigInt(i + 1)})),
			inClear: true,
		});
		expect(result.success).toBe(true);

		// the CLI processes its queue every second
		const executions: any[] = [];
		const deadline = Date.now() + 20000;
		while (executions.length < recipients.length && Date.now() < deadline) {
			const response = await fetch(
				`${FUZD_URL}/api/execution/execution/${chainId}/${signer}/${slot}/${executions.length}`,
			);
			const json = await response.json();
			if (json.success && json.execution) {
				executions.push(json.execution);
			} else {
				await new Promise((r) => setTimeout(r, 500));
			}
		}
		expect(executions).toHaveLength(recipients.length);

		const receipts: any[] = [];
		for (const execution of executions) {
			expect(execution.transactionParametersUsed.from.toLowerCase()).toEqual(remoteAccount.address.toLowerCase());
			let receipt = null;
			while (!receipt && Date.now() < deadline) {
				receipt = await rpc('eth_getTransactionReceipt', [execution.hash]);
				if (!receipt) await new Promise((r) => setTimeout(r, 200));
			}
			expect(receipt?.status).toBe('0x1');
			receipts.push(receipt);
		}
		// in the batch's order: consecutive nonces, and mined in that order
		const nonces = executions.map((v) => Number(v.transactionParametersUsed.nonce));
		expect(nonces).toEqual([nonces[0], nonces[0] + 1, nonces[0] + 2]);
		expect(receipts.map((v) => v.to)).toEqual([...recipients]);
		const positions = receipts.map((v) => [Number(v.blockNumber), Number(v.transactionIndex)]);
		expect([...positions].sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual(positions);
		for (let i = 0; i < recipients.length; i++) {
			expect(BigInt(await rpc('eth_getBalance', [recipients[i], 'latest']))).toEqual(BigInt(i + 1));
		}
	}, 40000);
});

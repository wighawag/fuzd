import {describe, it, expect, assert, beforeAll} from 'vitest';

import {createClient} from 'fuzd-server';
import {ANVIL_URL, FUZD_URL} from './prool/pool';
import {EthereumTransactionData} from 'fuzd-chain-protocol/ethereum';
import {ExecutionSubmission} from 'fuzd-common';
import {ScheduledExecution} from 'fuzd-scheduler';
import {privateKeyToAccount} from 'viem/accounts';

const client = createClient(FUZD_URL);

describe('hono client', () => {
	// --------------------------------------------------------------------------------------------
	// wakeup worker
	//   the first time the worker is called, it setups itself and this can take time
	//   We also call setChainOverride to ensure the api is talking to the proper eth node
	// --------------------------------------------------------------------------------------------
	beforeAll(async () => {
		await client.admin.setChainOverride[':chainId'][':chainOverride'].$get({
			param: {
				chainId: '0x7a69',
				chainOverride: encodeURIComponent(`${ANVIL_URL}#finality=2&worstCaseBlockTime=5`),
			},
		});
	}, 10000);
	// --------------------------------------------------------------------------------------------

	it(`fetch publicKey`, async () => {
		const response = await client.api.publicKey.$get();
		console.log(response);
		const json = await response.json();
		expect(json.success).toBe(true);
		assert(json.success);
		expect(json.publicKey).toBeTypeOf('string');
		expect(json.publicKey.length).toBeGreaterThan(0);
	});

	it(`should be able to submit a scheduled transaction`, async () => {
		// we use a local account
		const wallet = privateKeyToAccount('0x1111111111111111111111111111111111111111111111111111111111111111');

		// Note that is need to be lower case
		const chainId = `0x7a69`;

		// we get the remote address associated with local account signing the execution message sent to the api
		const remoteAccountResponse = await client.api.execution.remoteAccount[':chainId'][':account'].$get({
			param: {
				account: wallet.address,
				chainId,
			},
		});
		const remoteAccountResult = await remoteAccountResponse.json();
		expect(remoteAccountResult.success).toBe(true);
		assert(remoteAccountResult.success);

		const serviceParameters = remoteAccountResult.account.serviceParameters;

		// we build up first the transaction we want to submit in the future (delayed)
		// this is a ethereum tx without gas pricing
		// and we wrap in an execution submission where we specify the maxFeePerGas we accept
		// as well as the derivation parameters we got from the remote-account (above)
		const execution: ExecutionSubmission<EthereumTransactionData> = {
			chainId,
			// the ethereum tx:
			transaction: {
				gas: `0x1000000`,
				type: '0x2',
			},
			maxFeePerGasAuthorized: `0x10`,
		};

		// then we have several option
		// we could encrypt the tx data above and use time-lock encryption
		// but here we showcase the simpler example where the data is actually sent to the api server in clear

		const fuzdExecution: ScheduledExecution<ExecutionSubmission<EthereumTransactionData>> = {
			type: 'clear',
			// note that even tough you specified the chainId in the execution data, you still need to specify here
			// this is because the scheduler is agnostic to the executor and need to know which network it should look for
			chainId,
			// slot is used an identifier for the scheduled execution
			// this allows you in the future to replace the execution already scheduled by another
			slot: `any`,

			// there is then different type of delay you can specify
			// here we go with a fixed time at which the execution should be broadcasted, instead of a delta
			timing: {
				type: 'fixed-time',
				scheduledTime: 100000000000,
			},
			// finaly we provide the execution we created above
			executions: [execution],
			executionServiceParameters: serviceParameters,
		};

		// we convert the json as a string
		const jsonAsString = JSON.stringify(fuzdExecution);
		// we sign it wit our local account above
		const signature = await wallet.signMessage({message: jsonAsString});

		// finally we perform the network request
		// the json (as string) is the body
		// and the signature, computed above is provided via headers
		const resp = await client.api.scheduling.scheduleExecution.$post(
			{json: fuzdExecution}, // this is not used but we set it for the compiler
			// We instead use `jsonAsString` as the signature is based on the raw body
			// And so we want to set it ourselve so the signature match
			{
				init: {
					headers: {
						'content-type': 'application/json',
						signature,
					},
					body: jsonAsString,
				},
			},
		);

		if (!resp.ok) {
			console.log(resp.status, resp.statusText);
			const text = await resp.clone().text();
			console.log(text);
		}

		assert(resp.ok);
		const json = await resp.json();
		expect(json.success).toBe(true);
		if (!resp.ok || !json.success) {
			console.log(json);
			console.log(resp.status, resp.statusText);
		}
		expect(json.info.chainId).to.equal(chainId);
	});

	it('fails with wrong data', async () => {
		const response = await client.api.scheduling.scheduleExecution.$post({
			json: {
				type: 'clear',
				chainId: '0x1',
				executions: [
					{
						chainId: '0x1',
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
				executionServiceParameters: {
					derivationParameters: {data: '', type: 'ethereum'},
					fees: {fixed: '0', per_1000_000: 0},
				}, // TODO
			},
		});
		expect(response.ok).toBe(false);
		// const json = await response.json();
		// console.log(JSON.stringify(json));
	});
});

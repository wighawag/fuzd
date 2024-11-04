import {describe, it, expect} from 'vitest';

import {ExecutionSubmission} from 'fuzd-common';
import {ScheduledExecution} from 'fuzd-scheduler';
import {privateKeyToAccount} from 'viem/accounts';
import type {EthereumTransactionData} from 'fuzd-chain-protocol/ethereum';
import {connectToWorker} from './external-worker';
import {ANVIL_URL} from './prool/pool';

const worker = connectToWorker();

describe('raw api call', () => {
	// --------------------------------------------------------------------------------------------
	// wakeup worker
	//   the first time the worker is called, it setups itself and this can take time
	//   hence we have a dummy test to ensure the other tests have normal timeout
	//   We also call setChainOverride to ensure the api is talking to the proper eth node
	// --------------------------------------------------------------------------------------------
	it('startup', {timeout: 10000}, async () => {
		await worker.fetch(
			`/admin/setChainOverride/0x7a69/${encodeURIComponent(`${ANVIL_URL}#finality=2&worstCaseBlockTime=5`)}`,
		);
	});
	// --------------------------------------------------------------------------------------------

	it('should be able to submit a scheduled transaction', async function () {
		// we use a local account
		const wallet = privateKeyToAccount('0x1111111111111111111111111111111111111111111111111111111111111111');

		// Note that is need to be lower case
		const chainId = `0x7a69`;

		// we get the remote address associated with local account signing the execution message sent to the api
		const remoteAccountResponse = await worker
			.fetch(`/api/execution/remoteAccount/${chainId}/${wallet.address}`)
			.then((v) => v.json());
		expect(remoteAccountResponse.success).toBe(true);

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
			derivationParameters: remoteAccountResponse.account.derivationParameters,
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
		};

		// we convert the json as a string
		const jsonAsString = JSON.stringify(fuzdExecution);
		// we sign it wit our local account above
		const signature = await wallet.signMessage({message: jsonAsString});

		// finally we perform the network request
		// the json (as string) is the body
		// and the signature, computed above is provided via headers
		const resp = await worker.fetch(`/api/scheduling/scheduleExecution`, {
			body: jsonAsString,
			headers: {
				'content-type': 'application/json',
				signature,
			},
			method: 'POST',
		});
		const json: any = await resp.json();
		if (!resp.ok) {
			console.log(json);
			console.log(resp.status, resp.statusText);
		}
		expect(json.success).toBe(true);
		expect(json.info.chainId).to.equal(chainId);
	});
});

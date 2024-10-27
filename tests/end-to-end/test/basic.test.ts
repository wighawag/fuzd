import {describe, it, expect} from 'vitest';

import {ExecutionSubmission} from 'fuzd-common';
import {ScheduledExecution} from 'fuzd-scheduler';
import {privateKeyToAccount} from 'viem/accounts';
import type {TransactionData} from 'fuzd-chain-protocol/ethereum';
import {connectToWorker} from './external-worker';

const worker = connectToWorker();

describe('fuzd api', () => {
	it('responds with "fuzd api"', async () => {
		const response = await worker.fetch('/');
		expect(await response.text()).toBe('fuzd api');
	});

	it('should', async function () {
		const wallet = privateKeyToAccount('0x1111111111111111111111111111111111111111111111111111111111111111');

		// we get the remote address associated with the private key signing the execution message sent to the api
		const publicKey = await worker.fetch(`/api/publicKey`).then((v) => v.text());
		console.log({publicKey});
		// this will need to hold some ETH, so it can carry the execution.
		// const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);
		// this mechanism allows to isolate each account nonces and allow then for the user to update the gas pricing

		const chainIdAsHex = `0x7a69`; // Note that is need to be lower case // TODO

		// we build up first the transaction we want to submit in the future (delayed)
		// this is mostly a normal tx object, except for the broadcastSchedule
		const execution: ExecutionSubmission<TransactionData> = {
			chainId: chainIdAsHex,
			transaction: {
				gas: `0x1000000`,
				type: '0x2',
			},
			// the broadcastSchedule let you define gas behavior depending on time
			// you can also define how long each behavior should last
			// this also allow you to give a time expiry
			// Note though that the api can set its own limit and might not want to keep trying forever
			// TODO make it simpler for now
			maxFeePerGasAuthorized: `0x10`,
			derivationParameters: {
				type: 'ethereum',
				data: publicKey, // TODO add getBroadcaster endpoint
			},
		};

		// then we have several option
		// we could encrypt the tx data above and use time-lock encryption
		// but here we showcase the simpler example where the data is actually sent to the api in clear

		const fuzdExecution: ScheduledExecution<ExecutionSubmission<TransactionData>> = {
			type: 'clear',
			// note that even tough you specified the chainId in the tx data, you still need to specify here
			// this is because the scheduler need to know which network it should look for
			// we could have make it optional but we prefers a bit of verbosity here
			chainId: chainIdAsHex,
			// slot is used an identifier for the scheduled
			// this could allow you in the future to replace execution if things changed
			slot: `any`,

			// there is then different type of delay you can specify
			// here we go with a fixed time at which the execution should be broadcasted, instead of a delta
			timing: {
				type: 'fixed-time',
				scheduledTime: 100000000000,
			},
			// finaly we provided the tx in clear
			executions: [execution],
		};

		// we convert the json as a string
		const jsonAsString = JSON.stringify(fuzdExecution);
		// we sign it
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
		const text = await resp.clone().text();
		console.log(`TEXT RESPONSE:`, text);
		const json: any = await resp.json();
		console.log(json);
		expect(json.chainId).to.equal(chainIdAsHex);
	});
});

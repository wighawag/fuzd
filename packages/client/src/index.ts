/**
 * fuzd-client is a wrapper to make it easier to send request to fuzd api
 * @module
 */

import {ScheduleInfo, ScheduledExecution, DecryptedPayload} from 'fuzd-scheduler';
import {timelockEncrypt, HttpChainClient, roundAt} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {ExecutionSubmission, String0x} from 'fuzd-common';
import {EthereumTransactionData} from 'fuzd-chain-protocol/ethereum';
export {testnetClient, mainnetClient} from 'tlock-js';

export type ClientConfig = {
	drand: HttpChainClient;
	schedulerEndPoint: string | ((execution: string, signature: String0x) => Promise<ScheduleInfo>);
	privateKey: String0x;
};

export function createClient(config: ClientConfig) {
	const wallet = privateKeyToAccount(config.privateKey);

	async function scheduleExecution(execution: {
		chainId: String0x | string;
		transaction: {
			gas: bigint;
			data?: String0x;
			to?: String0x;
		};
		maxFeePerGasAuthorized: bigint;
		time: number;
	}): Promise<ScheduleInfo> {
		let executionToSend: ScheduledExecution<ExecutionSubmission<EthereumTransactionData>>;

		const chainId = (
			execution.chainId.startsWith('0x') ? execution.chainId : `0x` + parseInt(execution.chainId).toString(16)
		) as String0x;

		// TODO
		const {derivationParameters, address} = await fetch(
			`${config.schedulerEndPoint}/broadcaster/${wallet.address}`,
		).then((v) => v.json());

		const payloadJSON: DecryptedPayload<ExecutionSubmission<EthereumTransactionData>> = {
			type: 'clear',
			executions: [
				{
					chainId,
					maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as String0x,
					transaction: {
						type: '0x2',
						gas: ('0x' + execution.transaction.gas.toString(16)) as String0x,
						data: execution.transaction.data,
						to: execution.transaction.to,
					},
					derivationParameters,
				},
			],
		};
		const payloadAsJSONString = JSON.stringify(payloadJSON);

		let round: number;
		const drandChainInfo = await config.drand.chain().info();
		round = roundAt(execution.time * 1000, drandChainInfo);

		const timestamp = Math.floor(Date.now() / 1000);

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), config.drand);
		executionToSend = {
			chainId,
			slot: timestamp.toString(),
			timing: {
				type: 'fixed-round',
				expectedTime: execution.time,
				scheduledRound: round,
			},
			type: 'time-locked',
			payload,
		};
		const jsonAsString = JSON.stringify(executionToSend);
		const signature = await wallet.signMessage({message: jsonAsString});
		if (typeof config.schedulerEndPoint === 'string') {
			const response = await fetch(config.schedulerEndPoint, {
				method: 'POST',
				body: jsonAsString,
				headers: {
					signature,
					'content-type': 'application/json',
				},
			});
			if (response.ok) {
				return response.json();
			} else {
				const text = await response.text();
				throw new Error(`could not schedule execution: ${text}`);
			}
		} else {
			return config.schedulerEndPoint(jsonAsString, signature);
		}
	}

	return {
		scheduleExecution,
	};
}

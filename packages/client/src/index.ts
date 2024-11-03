/**
 * fuzd-client is a wrapper to make it easier to send request to fuzd api
 * @module
 */

import {ScheduleInfo, ScheduledExecution, DecryptedPayload} from 'fuzd-scheduler';
import {timelockEncrypt, HttpChainClient, roundAt} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {ExecutionSubmission, String0x} from 'fuzd-common';
import {EthereumTransactionData} from 'fuzd-chain-protocol/ethereum';

import {testnetClient, mainnetClient} from 'tlock-js';
import {InvokeTransactionData, StarknetTransactionData} from 'fuzd-chain-protocol/starknet';
export {mainnetClient, testnetClient};

export type ClientConfig = {
	drand?: HttpChainClient;
	schedulerEndPoint: string | ((execution: string, signature: String0x) => Promise<ScheduleInfo>);
	privateKey: String0x;
};

export type SimplerEthereumTransactionData = Omit<EthereumTransactionData, 'gas' | 'value' | 'type'> & {
	gas: bigint | String0x | number;
	value?: bigint | String0x;
};

export type SimplerStarknetTransactionData = Omit<InvokeTransactionData, 'type' | 'max_fee' | 'version'> & {
	max_fee: bigint | String0x;
};

function hex(b: bigint | String0x | number): String0x {
	return (typeof b === 'string' ? b : `0x${b.toString(16)}`) as String0x;
}

function fromSimplerTransactionData(
	simple: SimplerStarknetTransactionData | SimplerEthereumTransactionData,
): StarknetTransactionData | EthereumTransactionData {
	if ('gas' in simple && simple.gas) {
		return {
			gas: hex(simple.gas),
			type: '0x2',
			accessList: simple.accessList,
			data: simple.data,
			to: simple.to,
			value: simple.value ? hex(simple.value) : undefined,
		};
	} else if ('max_fee' in simple && simple.max_fee) {
		return {
			type: 'INVOKE',
			version: '0x1', // TODO v3
			calldata: simple.calldata,
			max_fee: hex(simple.max_fee),
		};
	} else {
		throw new Error(`invalid transaction: ${simple}`);
	}
}

export function createClient(config: ClientConfig) {
	const wallet = privateKeyToAccount(config.privateKey);
	const drandClient = config.drand || mainnetClient();

	async function scheduleExecution(execution: {
		chainId: String0x | string;
		transaction: SimplerEthereumTransactionData | SimplerStarknetTransactionData; // TODO use BinumberIshTransactionData
		maxFeePerGasAuthorized: bigint;
		time: number;
	}): Promise<ScheduleInfo> {
		let executionToSend: ScheduledExecution<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>>;

		const chainId = (
			execution.chainId.startsWith('0x') ? execution.chainId : `0x` + parseInt(execution.chainId).toString(16)
		) as String0x;

		const remoteAccountResponse = await fetch(
			`${config.schedulerEndPoint}/api/remoteAccount/${chainId}/${wallet.address}`,
		);
		const remoteAccountResult = await remoteAccountResponse.json();
		if (!remoteAccountResult.success) {
			throw new Error(
				remoteAccountResult.error ||
					`failed: ${config.schedulerEndPoint}/api/remoteAccount/${chainId}/${wallet.address}`,
			);
		}
		const {derivationParameters, address} = remoteAccountResult.account;

		const transactionData = fromSimplerTransactionData(execution.transaction);
		const payloadJSON: DecryptedPayload<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>> = {
			type: 'clear',
			executions: [
				{
					chainId,
					maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as String0x,
					transaction: transactionData,
					derivationParameters,
				},
			],
		};
		const payloadAsJSONString = JSON.stringify(payloadJSON);

		let round: number;

		const drandChainInfo = await drandClient.chain().info();
		round = roundAt(execution.time * 1000, drandChainInfo);

		const timestamp = Math.floor(Date.now() / 1000);

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), drandClient);
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
			const response = await fetch(`${config.schedulerEndPoint}/api/scheduling/scheduleExecution`, {
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

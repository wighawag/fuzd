/**
 * fuzd-client is a wrapper to make it easier to send request to fuzd api
 * @module
 */

import {ScheduleInfo, ScheduledExecution, DecryptedPayload} from 'fuzd-scheduler';
import {timelockEncrypt, HttpChainClient, roundAt} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {ExecutionSubmission, RemoteAccountInfo, String0x} from 'fuzd-common';
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

function toChainId(chainId: string | String0x): String0x {
	return (chainId.startsWith('0x') ? chainId : `0x` + parseInt(chainId).toString(16)) as String0x;
}

export function createClient(config: ClientConfig) {
	const wallet = privateKeyToAccount(config.privateKey);
	const drandClient = config.drand || mainnetClient();

	let _assignedRemoteAccount: RemoteAccountInfo | undefined;

	async function _fetchRemoteAccount(chainId: String0x | string): Promise<RemoteAccountInfo> {
		const chainIdAsHex = toChainId(chainId);

		const remoteAccountRequestUrl = `${config.schedulerEndPoint}/api/execution/remoteAccount/${chainIdAsHex}/${wallet.address}`;
		const remoteAccountResponse = await fetch(remoteAccountRequestUrl);
		let remoteAccountResult;
		try {
			remoteAccountResult = await remoteAccountResponse.clone().json();
		} catch (err) {
			throw new Error(
				`failed to parse response: ${remoteAccountRequestUrl}: ${err} ${await remoteAccountResponse.text()}`,
			);
		}

		if (!remoteAccountResult.success) {
			throw new Error(remoteAccountResult.error || `failed: ${remoteAccountRequestUrl}`);
		}
		return remoteAccountResult.account;
	}
	async function assignRemoteAccount(chainId: String0x | string): Promise<RemoteAccountInfo> {
		_assignedRemoteAccount = await _fetchRemoteAccount(chainId);
		return _assignedRemoteAccount;
	}

	async function scheduleExecution(execution: {
		chainId: String0x | string;
		transaction: SimplerEthereumTransactionData | SimplerStarknetTransactionData; // TODO use BinumberIshTransactionData
		maxFeePerGasAuthorized: bigint;
		time: number;
	}): Promise<{success: true; info: ScheduleInfo} | {success: false; error: unknown}> {
		const chainIdAsHex = toChainId(execution.chainId);

		let executionToSend: ScheduledExecution<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>>;
		const remoteAccount = await _fetchRemoteAccount(execution.chainId);
		if (_assignedRemoteAccount && remoteAccount.address != _assignedRemoteAccount.address) {
			throw new Error(`remoteAccount derivation changed`);
		}
		const transactionData = fromSimplerTransactionData(execution.transaction);
		const payloadJSON: DecryptedPayload<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>> = {
			type: 'clear',
			executions: [
				{
					chainId: chainIdAsHex,
					maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as String0x,
					transaction: transactionData,
					derivationParameters: remoteAccount.derivationParameters,
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
			chainId: chainIdAsHex,
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
			try {
				return response.json();
			} catch (err: any) {
				throw new Error(`could not parse response: ${err}`);
			}
		} else {
			const info = await config.schedulerEndPoint(jsonAsString, signature);
			return {
				success: true,
				info,
			};
		}
	}

	return {
		assignRemoteAccount,
		scheduleExecution,
	};
}

/**
 * fuzd-client is a wrapper to make it easier to send request to fuzd api
 * @module
 */

import type {ScheduleInfo, ScheduledExecution, DecryptedPayload} from 'fuzd-scheduler';
import {timelockEncrypt, HttpChainClient, roundAt, Buffer} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import type {ExecutionSubmission, IntegerString, RemoteAccountInfo, String0x} from 'fuzd-common';
import {EthereumTransactionData} from 'fuzd-chain-protocol/ethereum';

import {testnetClient, mainnetClient} from 'tlock-js';
import {InvokeTransactionData, StarknetTransactionData} from 'fuzd-chain-protocol/starknet';
export {mainnetClient, testnetClient};

export type {ScheduleInfo, ScheduledExecution, DecryptedPayload};
export type {ExecutionSubmission, RemoteAccountInfo, String0x};
export type {EthereumTransactionData, StarknetTransactionData, InvokeTransactionData};

(globalThis as any).Buffer = Buffer;

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

	let _assignedRemoteAccount: RemoteAccountInfo | undefined;

	async function _fetchRemoteAccount(chainId: IntegerString): Promise<RemoteAccountInfo> {
		const remoteAccountRequestUrl = `${config.schedulerEndPoint}/api/execution/remoteAccount/${chainId}/${wallet.address}`;
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
	async function assignRemoteAccount(chainId: IntegerString): Promise<RemoteAccountInfo> {
		_assignedRemoteAccount = await _fetchRemoteAccount(chainId);
		return _assignedRemoteAccount;
	}

	function computeTotalMaxCost(params: {maxFeePerGasAuthorized: bigint; gas: bigint; value?: bigint}): bigint {
		const txCost = params.maxFeePerGasAuthorized * params.gas;
		const value = params.value ? params.value : 0n;
		if (!_assignedRemoteAccount) {
			throw new Error(`need to assign a account first`);
		}
		const serviceParameters = _assignedRemoteAccount.serviceParameters;
		const fees = serviceParameters.fees;
		if (fees.fixed != '0' || fees.per_1_000_000 > 0) {
			const feeToPay = BigInt(fees.fixed) + (BigInt(fees.per_1_000_000) * txCost) / 1_000_000n;
			return txCost + feeToPay + value;
		}
		return txCost + value;
	}

	async function computeBalanceRequired(params: {
		slot: string;
		chainId: IntegerString;
		maxFeePerGasAuthorized: bigint;
		gas: bigint;
		value?: bigint;
	}): Promise<bigint> {
		const totalMaxCost = computeTotalMaxCost(params);
		if (!_assignedRemoteAccount) {
			throw new Error(`need to assign a account first`);
		}

		const reservedRequestUrl = `${config.schedulerEndPoint}/api/scheduling/reserved/${params.chainId}/${_assignedRemoteAccount.address}/${params.slot}`;
		const reservedResponse = await fetch(reservedRequestUrl);
		let reservedResult;
		try {
			reservedResult = await reservedResponse.clone().json();
		} catch (err) {
			throw new Error(`failed to parse response: ${reservedRequestUrl}: ${err} ${await reservedResponse.text()}`);
		}

		if (!reservedResult.success) {
			throw new Error(reservedResult.errors);
		}

		const amountReserved = BigInt(reservedResult.total);

		return amountReserved + totalMaxCost;
	}

	async function scheduleExecution(
		execution: {
			slot: string;
			chainId: IntegerString;
			transaction: SimplerEthereumTransactionData | SimplerStarknetTransactionData; // TODO use BinumberIshTransactionData
			maxFeePerGasAuthorized: bigint;
			time: number;
			expiry?: number;
			paymentReserve?: {amount: bigint; broadcaster: String0x};
			onBehalf?: `0x${string}`;
		},
		options?: {fakeEncrypt?: boolean},
	): Promise<{success: true; info: ScheduleInfo} | {success: false; error: unknown}> {
		let executionToSend: ScheduledExecution<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>>;
		const remoteAccount = await _fetchRemoteAccount(execution.chainId);
		if (_assignedRemoteAccount && remoteAccount.address != _assignedRemoteAccount.address) {
			throw new Error(`remoteAccount derivation changed`);
		}
		const serviceParameters = remoteAccount.serviceParameters;
		const transactionData = fromSimplerTransactionData(execution.transaction);
		const payloadJSON: DecryptedPayload<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>> = {
			type: 'clear',
			executions: [
				{
					chainId: execution.chainId,
					maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as String0x,
					transaction: transactionData,
				},
			],
		};
		const payloadAsJSONString = JSON.stringify(payloadJSON);

		let round: number;

		const timestamp = Math.floor(Date.now() / 1000);

		const drandChainInfo = await drandClient.chain().info();
		round = roundAt(options?.fakeEncrypt ? timestamp * 1000 : execution.time * 1000, drandChainInfo);

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), drandClient);
		executionToSend = {
			chainId: execution.chainId,
			slot: execution.slot,
			timing: {
				type: 'fixed-round',
				expectedTime: execution.time,
				scheduledRound: round,
				expiry: execution.expiry,
			},
			executionServiceParameters: serviceParameters,
			paymentReserve: execution.paymentReserve
				? {amount: execution.paymentReserve.amount.toString(), broadcaster: execution.paymentReserve.broadcaster}
				: undefined, // TODO 0xstring ?
			onBehalf: execution.onBehalf,
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

	function getRemoteAccount() {
		return _assignedRemoteAccount?.address;
	}

	return {
		getRemoteAccount,
		assignRemoteAccount,
		scheduleExecution,
		computeTotalMaxCost,
		computeBalanceRequired,
	};
}

export type FuzdClient = ReturnType<typeof createClient>;

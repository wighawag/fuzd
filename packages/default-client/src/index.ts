import {ScheduleInfo, ScheduledExecution, DecryptedPayload} from 'fuzd-scheduler';
import {timelockEncrypt, HttpChainClient, roundAt} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {BroadcastSchedule, TransactionSubmission} from 'fuzd-executor';
import {deriveRemoteAddress} from 'remote-account';
export {testnetClient, mainnetClient} from 'tlock-js';

export type ClientConfig = {
	drand: HttpChainClient;
	schedulerEndPoint: string | ((execution: string, signature: `0x${string}`) => Promise<ScheduleInfo>);
	privateKey: `0x${string}`;
};

export function createClient(config: ClientConfig) {
	const wallet = privateKeyToAccount(config.privateKey);

	async function getRemoteAccount() {
		const publicKey = await fetch(`${config.schedulerEndPoint}/publicKey`).then((v) => v.text());
		const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);
		return remoteAddress;
	}
	async function submitExecution(execution: {
		chainId: `0x${string}` | string;
		gas: bigint;
		broadcastSchedule: [
			{
				duration: number;
				maxFeePerGas: bigint;
				maxPriorityFeePerGas: bigint;
			},
		];
		data: `0x${string}`;
		to: `0x${string}`;
		time: number;
	}): Promise<ScheduleInfo> {
		let executionToSend: ScheduledExecution<TransactionSubmission>;

		const chainId = (
			execution.chainId.startsWith('0x') ? execution.chainId : `0x` + parseInt(execution.chainId).toString(16)
		) as `0x${string}`;

		const payloadJSON: DecryptedPayload<TransactionSubmission> = {
			type: 'clear',
			transactions: [
				{
					type: '0x2',
					chainId,
					gas: ('0x' + execution.gas.toString(16)) as `0x${string}`,
					broadcastSchedule: execution.broadcastSchedule.map((v) => ({
						duration: ('0x' + v.duration.toString(16)) as `0x${string}`,
						maxFeePerGas: ('0x' + v.maxFeePerGas.toString(16)) as `0x${string}`,
						maxPriorityFeePerGas: ('0x' + v.maxPriorityFeePerGas.toString(16)) as `0x${string}`,
					})) as BroadcastSchedule,
					data: execution.data,
					to: execution.to,
				},
			],
		};
		const payloadAsJSONString = JSON.stringify(payloadJSON);

		let round: number;
		const drandChainInfo = await config.drand.chain().info();
		round = roundAt(execution.time * 1000, drandChainInfo);

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), config.drand);
		executionToSend = {
			chainId,
			slot: `1`,
			timing: {
				type: 'fixed-round',
				expectedTime: execution.time,
				scheduledRound: round,
			},
			maxFeePerGas: '0',
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
			return response.json();
		} else {
			return config.schedulerEndPoint(jsonAsString, signature);
		}
	}

	return {
		submitExecution,
		getRemoteAccount,
	};
}

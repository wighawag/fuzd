import {FixedTiming, ScheduleInfo, ScheduledExecution} from 'fuzd-scheduler';
import {timelockEncrypt, HttpChainClient, roundAt, roundTime} from 'tlock-js';
import fetch from 'isomorphic-unfetch';
import {privateKeyToAccount} from 'viem/accounts';
import {TimeBasedTiming} from 'fuzd-scheduler';
import {RoundBasedTiming} from 'fuzd-scheduler';

export type ClientConfig = {
	drand: HttpChainClient;
	schedulerEndPoint: string | ((id: string, execution: string, signature: `0x${string}`) => Promise<ScheduleInfo>);
	privateKey: `0x${string}`;
};

export function createClient<TransactionDataType>(config: ClientConfig) {
	const wallet = privateKeyToAccount(config.privateKey);
	async function submitExecution(execution: {
		chainId: `0x${string}` | string;
		gas: bigint;
		broadcastSchedule: [
			{
				duration: number;
				maxFeePerGas: bigint;
				maxPriorityFeePerGas: bigint;
			}
		];
		data: `0x${string}`;
		to: `0x${string}`;
		time: number;
	}): Promise<ScheduleInfo> {
		let executionToSend: ScheduledExecution<
			TransactionDataType,
			RoundBasedTiming | TimeBasedTiming,
			RoundBasedTiming | TimeBasedTiming
		>;
		const payloadJSON = {};
		const payloadAsJSONString = JSON.stringify(payloadJSON);
		let round: number;
		let expectedTime: number;
		// const latestBeacon = await config.drand.latest();
		// const currentRound = latestBeacon.round;
		const drandChainInfo = await config.drand.chain().info();
		round = roundAt(execution.time, drandChainInfo);
		expectedTime = roundTime(drandChainInfo, round);

		const chainId = (
			execution.chainId.startsWith('0x') ? execution.chainId : `0x` + parseInt(execution.chainId).toString(16)
		) as `0x${string}`;

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), config.drand);
		executionToSend = {
			chainId,
			timing: {
				type: 'fixed',
				value: {
					type: 'round',
					expectedTime,
					round,
				},
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
			return response.json();
		} else {
			return config.schedulerEndPoint(signature, jsonAsString, signature);
		}
	}

	return {
		submitExecution,
	};
}

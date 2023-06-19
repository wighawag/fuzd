import ono from '@jsdevtools/ono';
import {ScheduledExecution, ScheduleInfo, Scheduler} from 'fuzd-scheduler';
import {hashMessage, recoverAddress, encodeAbiParameters} from 'viem';
import {SchedulerGateway, SignedScheduledExecution} from './types/scheduler-gateway';
import {TransactionSubmission} from 'fuzd-executor';

export const TimingType = {
	components: [
		{
			internalType: 'uint256',
			name: 'expiry',
			type: 'uint256',
		},
		{
			internalType: 'uint256',
			name: 'value',
			type: 'uint256',
		},
	],
	name: 'timing',
	type: 'tuple[]',
};

export const AssumedTransactionType = {
	components: [
		{
			internalType: 'bytes32',
			name: 'hash',
			type: 'bytes32',
		},
		{
			internalType: 'uint256',
			name: 'nonce',
			type: 'uint256',
		},
	],
	name: 'assumeTransaction',
	type: 'tuple[]',
};



export function encodeExecution(execution: ScheduledExecution<TransactionSubmission>): `0x${string}` {
	if (execution.type === 'clear') {
		if (execution.timing.type === 'fixed') {
			const data = encodeAbiParameters(
				[
					{name: '', type: }
				],
				[
					execution.timing.assumedTransaction?.hash,
					execution.timing.assumedTransaction?.nonce,
					execution.timing.expiry,
					execution.timing.value,
				]
			);
		} else if (execution.timing.type === 'delta') {
			execution.timing.startTransaction.broadcastTime
		}
	}
	// const data = encodeAbiParameters(
	// 	[
	// 		{name: 'to', type: 'address'},
	// 		{name: 'gas', type: 'uint256'},
	// 		{name: 'data', type: 'bytes'},
	// 		{name: 'type', type: 'uint8'},
	// 		{name: 'chainid', type: 'uint256'},
	// 		AccessListEntryType,
	// 		BroadcastScheduleType,
	// 	],
	// 	[
	// 		execution.to || '0x0000000000000000000000000000000000000000',
	// 		BigInt(execution.gas),
	// 		execution.data || '0x',
	// 		execution.type ? parseInt(execution.type.slice(2), 16) : 0,
	// 		BigInt(execution.chainId),
	// 		execution.accessList || [],
	// 		execution.broadcastSchedule,
	// 	]
	// );

	return data;
}

export function initSchedulerGateway<TransactionDataType>(
	scheduler: Scheduler<TransactionDataType>,
	options?: {debug: boolean}
): SchedulerGateway {
	async function submitSignedExecution(
		id: string,
		execution: SignedScheduledExecution<TransactionSubmission>
	): Promise<ScheduleInfo> {
		const data = encodeExecution(execution);
		const hash = hashMessage(data);
		if (!signature) {
			throw new Error(`signature not provided`);
		}
		let account: `0x${string}`;
		if (options?.debug && signature.startsWith('debug@')) {
			account = signature.split('@')[1] as `0x${string}`;
		} else {
			try {
				account = await recoverAddress({hash, signature});
			} catch (err: any) {
				throw ono(err, 'failed to recover address from message and signature');
			}
		}
		const actualID = `${account.toLowerCase()}_${id}`;
		const parsed: ScheduledExecution<TransactionDataType> = JSON.parse(execution);
		return scheduler.submitExecution(actualID, account, parsed);
	}

	return {
		submitSignedExecution,
	};
}

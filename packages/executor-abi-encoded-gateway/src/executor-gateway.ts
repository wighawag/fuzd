import ono from '@jsdevtools/ono';
import {Executor, TransactionSubmission, TransactionInfo} from 'fuzd-executor';
import {encodeAbiParameters, hashMessage, recoverAddress} from 'viem';
import {ExecutorGateway, SignedTransactionSubmission} from './types/executor-gateway';

export const AccessListEntryType = {
	components: [
		{
			internalType: 'address',
			name: 'address',
			type: 'address',
		},
		{
			internalType: 'bytes32[]',
			name: 'storageKeys',
			type: 'bytes32[]',
		},
	],
	name: 'accessList',
	type: 'tuple[]',
};

export const BroadcastScheduleType = {
	components: [
		{
			internalType: 'uint256',
			name: 'maxFeePerGas',
			type: 'uint256',
		},
		{
			internalType: 'uint256',
			name: 'maxPriorityFeePerGas',
			type: 'uint256',
		},
		{
			internalType: 'uint256',
			name: 'duration',
			type: 'uint256',
		},
	],
	name: 'broadcastSchedule',
	type: 'tuple[]',
};

export function encodeTransaction(execution: TransactionSubmission): `0x${string}` {
	const data = encodeAbiParameters(
		[
			{name: 'to', type: 'address'},
			{name: 'gas', type: 'uint256'},
			{name: 'data', type: 'bytes'},
			{name: 'type', type: 'uint8'},
			{name: 'chainid', type: 'uint256'},
			AccessListEntryType,
			BroadcastScheduleType,
		],
		[
			execution.to || '0x0000000000000000000000000000000000000000',
			BigInt(execution.gas),
			execution.data || '0x',
			execution.type ? parseInt(execution.type.slice(2), 16) : 0,
			BigInt(execution.chainId),
			execution.accessList || [],
			execution.broadcastSchedule,
		]
	);

	return data;
}

export function initExecutorGateway(
	executor: Executor<TransactionSubmission, TransactionInfo>,
	options?: {debug: boolean}
): ExecutorGateway {
	async function submitSignedTransaction(
		id: string,
		submission: SignedTransactionSubmission
	): Promise<TransactionInfo> {
		const hash = hashMessage(submission);
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
		const parsed: TransactionSubmission = JSON.parse(submission);
		// const id = submission.id ? `${account}_${submission.id}` : hash;
		return executor.submitTransaction(`${account.toLowerCase()}_${id}`, account, parsed);
	}

	return {
		submitSignedTransaction,
	};
}

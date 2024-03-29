import ono from 'wighawag-ono';
import {Executor, TransactionSubmission, TransactionInfo} from 'fuzd-executor';
import {hashMessage, recoverAddress} from 'viem';
import {ExecutorGateway} from './types/executor-gateway';

export function initExecutorGateway(
	executor: Executor<TransactionSubmission, TransactionInfo>,
	options?: {debug: boolean},
): ExecutorGateway {
	async function submitTransactionAsJsonString(
		slot: string,
		submission: string,
		signature: `0x${string}`,
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
		return executor.submitTransaction(slot, account, parsed);
	}

	return {
		submitTransactionAsJsonString,
	};
}

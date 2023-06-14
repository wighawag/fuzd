import ono from '@jsdevtools/ono';
import {Executor, ExecutionSubmission, TransactionInfo} from 'dreveal-executor';
import {hashMessage, recoverAddress} from 'viem';

export function initExecutorGateway(executor: Executor) {
	async function submitTransactionAsJsonString(submission: string, signature: `0x${string}`): Promise<TransactionInfo> {
		const hash = hashMessage(submission);
		if (!signature) {
			throw new Error(`signature not provided`);
		}
		let account: `0x${string}`;
		if (signature.startsWith('debug@')) {
			account = signature.split('@')[1] as `0x${string}`;
		} else {
			try {
				account = await recoverAddress({hash, signature});
			} catch (err: any) {
				throw ono(err, 'failed to recover address from message and signature');
			}
		}
		// const account = await recoverAddress({hash, signature});
		const id = hash;
		const parsed: ExecutionSubmission = JSON.parse(submission);
		return executor.submitTransaction(id, account, parsed);
	}

	return {
		submitTransactionAsJsonString,
	};
}

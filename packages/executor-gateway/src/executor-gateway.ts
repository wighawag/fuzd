import {Executor, ExecutionSubmission, TransactionInfo} from 'dreveal-executor';
import {hashMessage, recoverAddress} from 'viem';

export function initExecutorGateway(executor: Executor) {
	async function submitTransactionAsJsonString(submission: string, signature: `0x${string}`): Promise<TransactionInfo> {
		const hash = hashMessage(submission);
		const account = await recoverAddress({hash, signature});
		const id = hash;
		const parsed: ExecutionSubmission = JSON.parse(submission);
		return executor.submitTransaction(id, account, parsed);
	}

	return {
		submitTransactionAsJsonString,
	};
}

import {Execution, Scheduler} from 'dreveal-executor';
import {hashMessage, recoverAddress} from 'viem';

export function initSchedulerGateway(scheduler: Scheduler) {
	async function submitExecutionAsJsonString(
		execution: string,
		signature: `0x${string}`
	): Promise<{
		id: string;
		executionTime: number;
	}> {
		const hash = hashMessage(execution);
		const account = await recoverAddress({hash, signature});
		const id = hash;
		const parsed: Execution = JSON.parse(execution);
		return scheduler.submitExecution(id, account, parsed);
	}

	return {
		submitExecutionAsJsonString,
	};
}

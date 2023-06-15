import ono from '@jsdevtools/ono';
import {Execution, ScheduleInfo, Scheduler} from 'dreveal-executor';
import {hashMessage, recoverAddress} from 'viem';
import {SchedulerGateway} from './types/scheduler-gateway';

export function initSchedulerGateway(scheduler: Scheduler, options?: {debug: boolean}): SchedulerGateway {
	async function submitExecutionAsJsonString(
		id: string,
		execution: string,
		signature: `0x${string}`
	): Promise<ScheduleInfo> {
		const hash = hashMessage(execution);
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
		const parsed: Execution = JSON.parse(execution);
		return scheduler.submitExecution(actualID, account, parsed);
	}

	return {
		submitExecutionAsJsonString,
	};
}

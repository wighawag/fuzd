import ono from 'wighawag-ono';
import {ScheduledExecution, ScheduleInfo, Scheduler} from 'fuzd-scheduler';
import {hashMessage, recoverAddress} from 'viem';
import {SchedulerGateway} from './types/scheduler-gateway';

export function initSchedulerGateway<TransactionDataType>(
	scheduler: Scheduler<TransactionDataType>,
	options?: {debug: boolean},
): SchedulerGateway {
	async function submitExecutionAsJsonString(execution: string, signature: `0x${string}`): Promise<ScheduleInfo> {
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
		const parsed: ScheduledExecution<TransactionDataType> = JSON.parse(execution);
		return scheduler.submitExecution(account, parsed);
	}

	return {
		submitExecutionAsJsonString,
	};
}

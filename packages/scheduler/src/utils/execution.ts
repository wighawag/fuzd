import {ScheduledExecution} from '../types/external';
import {ExecutionQueued} from '../types/scheduler-storage';

export function computeInitialExecutionTimeFromSubmission<TransactionDataType>(
	execution: ScheduledExecution<TransactionDataType>,
): number {
	const timing = execution.timing;
	switch (timing.type) {
		case 'fixed-time':
			return timing.scheduledTime;
		case 'fixed-round':
			return timing.expectedTime;
		case 'delta-time':
			return timing.delta + timing.startTransaction.broadcastTime;
	}
	throw new Error(`execution timing type must be "fixed-time" | "fixed-round" | "delta-time`);
}

export function computePotentialExecutionTime<TransactionDataType>(
	execution: ExecutionQueued<TransactionDataType>,
	state?: {startTimeToCountFrom?: number; lastCheckin?: number},
): number {
	const timing = execution.timing;
	switch (timing.type) {
		case 'fixed-time':
			return timing.scheduledTime;
		case 'fixed-round':
			return timing.expectedTime;
		case 'delta-time':
			return (
				timing.delta +
				(execution.priorTransactionConfirmation
					? execution.priorTransactionConfirmation?.startTime
						? execution.priorTransactionConfirmation?.startTime
						: execution.priorTransactionConfirmation?.blockTime
					: state?.startTimeToCountFrom
						? state.startTimeToCountFrom
						: timing.startTransaction.broadcastTime)
			);
	}

	throw new Error(`execution timing type must be "fixed-time" | "fixed-round" | "delta-time"`);
}

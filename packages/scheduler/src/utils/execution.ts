import {ScheduledExecution} from '../types/external.js';
import {ScheduledExecutionQueued} from '../types/scheduler-storage.js';

export function computeInitialExecutionTimeFromSubmission<ExecutionDataType>(
	execution: ScheduledExecution<ExecutionDataType>,
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

export function computePotentialExecutionTime<ExecutionDataType>(
	execution: ScheduledExecutionQueued<ExecutionDataType>,
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

		case 'delta-time-with-target-time':
			const startTime = execution.priorTransactionConfirmation
				? execution.priorTransactionConfirmation?.startTime
					? execution.priorTransactionConfirmation?.startTime
					: execution.priorTransactionConfirmation?.blockTime
				: state?.startTimeToCountFrom
					? state.startTimeToCountFrom
					: timing.startTransaction.broadcastTime;
			const startTimePlusDelta = startTime + timing.delta;
			if (timing.targetTimeUnlessHigherDelta && timing.targetTimeUnlessHigherDelta > startTimePlusDelta) {
				return timing.targetTimeUnlessHigherDelta;
			}
			return startTimePlusDelta;
	}

	throw new Error(`execution timing type must be "fixed-time" | "fixed-round" | "delta-time"`);
}

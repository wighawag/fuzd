import {ScheduledExecution} from '../types/external';
import {ExecutionQueued} from '../types/scheduler-storage';

export function computeFirstExecutionTimeFromSubmission<TransactionDataType>(
	execution: ScheduledExecution<TransactionDataType>,
): number {
	if (execution.timing.type === 'fixed') {
		const value = execution.timing.value;
		if (value.type === 'time') {
			return value.time;
		} else if (value.type === 'round') {
			// TODO when execute check validity
			return value.expectedTime;
		} else if (value.type === 'round-period') {
			// TODO recompute it when times come
			return value.startTime + value.periodInRounds * value.averageSecondsPerRound;
		} else {
			// TODO recompute it when times come
			return value.startTime + value.periodInSeconds;
		}
	} else if (execution.timing.type === 'delta') {
		const delta = execution.timing.delta;
		if (delta.type === 'round') {
			return (
				// TODO when execute check validity
				delta.expectedTime + execution.timing.startTransaction.broadcastTime
			);
		} else {
			return delta.time + execution.timing.startTransaction.broadcastTime;
		}
	} else {
		throw new Error(`execution timing type must be "fixed" or "delta"`);
	}
}

export function computePotentialExecutionTime<TransactionDataType>(
	execution: ExecutionQueued<TransactionDataType>,
	state?: {startTimeToCountFrom?: number; lastCheckin?: number},
): number {
	if (execution.timing.type === 'fixed') {
		const value = execution.timing.value;
		if (value.type === 'time') {
			return value.time;
		} else if (value.type === 'round') {
			// TODO when execute check validity
			return value.expectedTime;
		} else if (value.type === 'round-period') {
			const averagePeriodInSeconds = value.periodInRounds * value.averageSecondsPerRound;
			const roundedDownStartTime = state?.lastCheckin
				? Math.floor(state?.lastCheckin / averagePeriodInSeconds) * averagePeriodInSeconds
				: value.startTime;
			return roundedDownStartTime + averagePeriodInSeconds;
		} else {
			const roundedDownStartTime = state?.lastCheckin
				? Math.floor(state?.lastCheckin / value.periodInSeconds) * value.periodInSeconds
				: value.startTime;
			return roundedDownStartTime + value.periodInSeconds;
		}
	} else if (execution.timing.type === 'delta') {
		const delta = execution.timing.delta;
		if (delta.type === 'round') {
			return (
				// TODO when execute check validity
				delta.expectedTime +
				(execution.timing.startTransaction.confirmed
					? execution.timing.startTransaction.confirmed?.startTime
						? execution.timing.startTransaction.confirmed?.startTime
						: execution.timing.startTransaction.confirmed?.blockTime
					: state?.startTimeToCountFrom
						? state.startTimeToCountFrom
						: execution.timing.startTransaction.broadcastTime)
			);
		} else {
			return (
				delta.time +
				(execution.timing.startTransaction.confirmed
					? execution.timing.startTransaction.confirmed?.startTime
						? execution.timing.startTransaction.confirmed?.startTime
						: execution.timing.startTransaction.confirmed?.blockTime
					: state?.startTimeToCountFrom
						? state.startTimeToCountFrom
						: execution.timing.startTransaction.broadcastTime)
			);
		}
	} else {
		throw new Error(`execution timing type must be "fixed" or "delta"`);
	}
}

import {Execution} from '../types/scheduler';
import {ExecutionQueued} from '../types/scheduler-storage';

export function computeExecutionTimeFromSubmission(execution: Execution): number {
	if (execution.timing.type === 'fixed') {
		return execution.timing.timestamp;
	} else if (execution.timing.type === 'delta') {
		return execution.timing.delta + execution.timing.startTransaction.broadcastTime;
	} else {
		throw new Error(`execution timing type must be "fixed" or "delta"`);
	}
}

export function computeExecutionTime(execution: ExecutionQueued, expectedStartTime?: number): number {
	if (execution.timing.type === 'fixed') {
		return execution.timing.timestamp;
	} else if (execution.timing.type === 'delta') {
		return (
			execution.timing.delta +
			(execution.timing.startTransaction.confirmed
				? execution.timing.startTransaction.confirmed?.startTime
					? execution.timing.startTransaction.confirmed?.startTime
					: execution.timing.startTransaction.confirmed?.blockTime
				: expectedStartTime
				? expectedStartTime
				: execution.timing.startTransaction.broadcastTime)
		);
	} else {
		throw new Error(`execution timing type must be "fixed" or "delta"`);
	}
}

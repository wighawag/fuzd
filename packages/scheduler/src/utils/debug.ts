import {ScheduledExecutionQueued} from '../types/scheduler-storage';

export function displayExecution(execution: ScheduledExecutionQueued<unknown>) {
	return JSON.stringify({slot: execution.slot, executionTime: execution.checkinTime});
}

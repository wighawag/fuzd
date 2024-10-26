import {ScheduledExecutionQueued} from '../types/scheduler-storage.js';

export function displayExecution(execution: ScheduledExecutionQueued<unknown>) {
	return JSON.stringify({slot: execution.slot, executionTime: execution.checkinTime});
}

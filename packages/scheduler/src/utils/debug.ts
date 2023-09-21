import {ExecutionQueued} from '../types/scheduler-storage';

export function displayExecution(execution: ExecutionQueued<unknown>) {
	return JSON.stringify({slot: execution.slot, executionTime: execution.checkinTime});
}

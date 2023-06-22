import {ExecutionQueued} from '../types/scheduler-storage';

export function displayExecution(execution: ExecutionQueued<unknown>) {
	return JSON.stringify({id: execution.id, executionTime: execution.checkinTime});
}

import {ExecutionQueued} from '../types/scheduler-storage';

export function displayExecution(execution: ExecutionQueued) {
	return JSON.stringify({id: execution.id, executionTime: execution.executionTime});
}

import {logs} from 'named-logs';
import {Execution} from './types';
const logger = logs('dreveal-executor');

const defaultFinality = 12;

export function submit(execution: Execution) {
	logger.info(execution);
}

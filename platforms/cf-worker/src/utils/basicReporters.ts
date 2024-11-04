import {logs} from 'named-logs';
import {LogEvent, type Reporter} from 'workers-logger';
const logger = logs('worker');

export const namedLogsReporter: Reporter = async (events: LogEvent[], context: {req: Request; res: Response}) => {
	for (const event of events) {
		if (event.error) {
			logger.error(event.error);
		}
		switch (event.level) {
			case 'fatal':
			case 'error':
				logger.error(...event.messages);
				break;
			case 'warn':
				logger.warn(...event.messages);
				break;
			case 'debug':
				logger.debug(...event.messages);
				break;
			case 'info':
				logger.info(...event.messages);
				break;
			case 'log':
				logger.log(...event.messages);
				break;
		}
	}
};

export const consoleReporter: Reporter = async (events: LogEvent[], context: {req: Request; res: Response}) => {
	console.log(`reporting ${events.length} events`);
	for (const event of events) {
		if (event.error) {
			console.error(event.error);
		}
		switch (event.level) {
			case 'fatal':
			case 'error':
				console.error(...event.messages);
				break;
			case 'warn':
				console.warn(...event.messages);
				break;
			case 'debug':
				console.debug(...event.messages);
				break;
			case 'info':
				console.info(...event.messages);
				break;
			case 'log':
				console.log(...event.messages);
				break;
		}
	}
};

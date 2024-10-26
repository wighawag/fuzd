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
				logger.error(event.message, ...event.extra);
				break;
			case 'warn':
				logger.warn(event.message, ...event.extra);
				break;
			case 'debug':
				logger.debug(event.message, ...event.extra);
				break;
			case 'info':
				logger.info(event.message, ...event.extra);
				break;
			case 'log':
				logger.log(event.message, ...event.extra);
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
				console.error(event.message, ...event.extra);
				break;
			case 'warn':
				console.warn(event.message, ...event.extra);
				break;
			case 'debug':
				console.debug(event.message, ...event.extra);
				break;
			case 'info':
				console.info(event.message, ...event.extra);
				break;
			case 'log':
				console.log(event.message, ...event.extra);
				break;
		}
	}
};

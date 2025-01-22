import type {LogEvent, LogLevels, Reporter} from 'workers-logger';
import {format} from 'workers-logger';

export const logflareReport: ({apiKey, source}: {apiKey: string; source: string}) => Reporter = ({apiKey, source}) => {
	return (events: LogEvent[], {req, res}: {req: Request; res: Response}) => {
		const url = new URL(req.url);

		let firstError;
		let logs: {
			level: LogLevels;
			message: any;
			error:
				| {
						name: any;
						message: any;
						stack: any;
				  }
				| undefined;
		}[] = [];
		try {
			logs = events.map((i) => {
				let firstMessage: string = i.message || 'no message provided';
				let moreMessages: string[] = [];
				if (Array.isArray(i.messages) && i.messages.length > 0) {
					firstMessage =
						i.messages[0] && typeof i.messages[0] === 'object' && 'toString' in i.messages[0]
							? i.messages[0].toString()
							: '' + i.messages[0];
					moreMessages = i.messages
						.slice(1)
						.map((m) => (m && typeof m === 'object' && 'toString' in m ? m.toString() : '' + m));
				}
				if (i.extra && Array.isArray(i.extra)) {
					moreMessages.push(
						...i.extra.map((m) => (m && typeof m === 'object' && 'toString' in m ? m.toString() : '' + m)),
					);
				}
				return {
					level: i.level,
					message: moreMessages ? format(firstMessage, ...moreMessages) : format(firstMessage),
					error: i.error
						? {
								name: i.error.name,
								message: i.error.message,
								stack: i.error.stack,
							}
						: undefined,
				};
			});

			for (const l of logs) {
				if (l.error) {
					firstError = l.error;
					break;
				}
			}
		} catch (err: any) {
			console.error(`logflare handling errored out with`, {
				events,
			});
			firstError = {
				name: err.name,
				message: err.toString(),
				stack: err.stack,
			};
			logs.push({
				level: 'error',
				message: err.toString(),
				error: firstError,
			});
		}

		const metadata = {
			method: req.method,
			pathname: url.pathname,
			headers: Object.fromEntries(req.headers),
			response: {
				status: res.status,
				headers: Object.fromEntries(res.headers),
			},
			log: logs,
			firstError,
		};

		const message = `${req.headers.get('cf-connecting-ip')} (${req.headers.get('cf-ray')}) ${req.method} ${req.url} ${res.status}`;

		return fetch('https://api.logflare.app/logs', {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				source,
				log_entry: message,
				metadata,
			}),
		});
	};
};

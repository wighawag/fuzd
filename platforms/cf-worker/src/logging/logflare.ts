import type {LogEvent, LogLevels, Reporter} from 'workers-logger';

const levelOrder: LogLevels[] = ['fatal', 'error', 'warn', 'debug', 'info', 'log'];

export const logflareReport: ({
	apiKey,
	source,
	batchAsSingleEvent,
}: {
	apiKey: string;
	source: string;
	batchAsSingleEvent?: boolean;
}) => Reporter = ({batchAsSingleEvent, apiKey, source}) => {
	return async (events: LogEvent[], {req, res}: {req: Request; res: Response}) => {
		const url = new URL(req.url);

		console.info(`reporting ${events.length} events on ${url.pathname}...`);

		// ${req.headers.get('cf-connecting-ip')} (${req.headers.get('cf-ray')})
		const requestMetadata = {
			method: req.method,
			pathname: url.pathname,
			// headers: req.headers ? Object.fromEntries(req.headers) : undefined,
		};

		let body: string | undefined;

		if (batchAsSingleEvent) {
			let firstMessage: string = 'no message provided';

			let firstImportantEvent: LogEvent | undefined;
			for (const event of events) {
				if (!firstImportantEvent || levelOrder.indexOf(event.level) < levelOrder.indexOf(firstImportantEvent.level)) {
					firstImportantEvent = event;
				}
			}

			if (!firstImportantEvent) {
				firstImportantEvent = {
					name: 'firstImportantEvent',
					level: 'error',
					messages: ['no events provided'],
				};
			}

			if (Array.isArray(firstImportantEvent.messages) && firstImportantEvent.messages.length > 0) {
				const message = firstImportantEvent.messages[0];
				firstMessage =
					message && typeof message === 'object' && 'toString' in message ? message.toString() : '' + message;
			}
			const log_entry = `${res.status} ${req.url}: ${firstMessage}`;
			try {
				body = JSON.stringify({
					source,
					log_entry,
					message: firstMessage,
					metadata: {
						logs: events.map((event) => ({
							level: event.level,
							message: `${event.messages[0] || 'no message'}`,
							params:
								event.messages.length > 1
									? event.messages.slice(1).map((v) => ({
											value: v,
										}))
									: undefined,
						})),
						request: requestMetadata,
					},
				});
			} catch {}
		} else {
			const batch = events.map((event) => ({
				message: `${res.status} ${req.url}: ${event.messages[0] || 'no message'}`,
				metadata: {
					level: event.level,
					params:
						event.messages.length > 1
							? event.messages.slice(1).map((v) => ({
									value: v,
								}))
							: undefined,
					request: requestMetadata,
				},
			}));

			try {
				body = JSON.stringify({
					source,
					batch,
				});
			} catch {}
		}

		if (!body) {
			const message = 'failed to stringify logflare body';
			console.error(message, {data: {events}});
			body = JSON.stringify({
				source,
				log_entry: message,
				metadata: {level: 'error', request: requestMetadata},
			});
			return;
		}

		const response: Response = await fetch('https://api.logflare.app/logs', {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'content-type': 'application/json',
			},
			body,
		});
		if (response.status !== 200) {
			console.error(`${response.status} ${response.statusText}, ${await response.text()}`, {data: {events}});
		}
		return response;
	};
};

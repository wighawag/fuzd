import type {LogEvent, Reporter} from 'workers-logger';
import {format} from 'workers-logger';

// TODO lib ?
export const logflareReport: ({apiKey, source}: {apiKey: string; source: string}) => Reporter = ({apiKey, source}) => {
	return (events: LogEvent[], {req, res}: {req: Request; res: Response}) => {
		const url = new URL(req.url);

		const metadata = {
			method: req.method,
			pathname: url.pathname,
			headers: Object.fromEntries(req.headers),
			response: {
				status: res.status,
				headers: Object.fromEntries(res.headers),
			},
			log: events.map((i) => ({
				level: i.level,
				message: format(i.message, ...i.extra),
				error: {
					name: i.error.name,
					message: i.error.message,
					stack: i.error.stack,
				},
			})),
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

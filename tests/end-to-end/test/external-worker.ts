import {WORKER_URL} from './prool/pool';

export function connectToWorker() {
	return {
		async fetch(req: Request | string, init?: RequestInit) {
			let request: Request | string;
			if (typeof req === 'string') {
				if (req.startsWith('http')) {
					request = req;
				} else {
					if (req.startsWith('/')) {
						request = `${WORKER_URL}${req}`;
					} else {
						request = `${WORKER_URL}${req}`;
					}
				}
			} else {
				request = req;
			}
			console.log(`fetching ${request}...`);
			const response = await fetch(request, init);

			return response;
		},
	};
}

import {ANVIL_URL, FUZD_URL} from './prool/pool';

export function connectToWorker() {
	return {
		async fetch(req: Request | string, init?: RequestInit) {
			let request: Request | string;
			if (typeof req === 'string') {
				if (req.startsWith('http')) {
					request = req;
				} else {
					if (req.startsWith('/')) {
						request = `${FUZD_URL}${req}`;
					} else {
						request = `${FUZD_URL}${req}`;
					}
				}
			} else {
				request = req;
			}
			const response = await fetch(request, init);

			return response;
		},
	};
}

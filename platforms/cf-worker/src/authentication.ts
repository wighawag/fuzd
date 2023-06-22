import {error} from 'itty-router';
import {logs} from 'named-logs';

const logger = logs('fuzd-cf-worker-authorization');

export function withAuthorization(envName: string) {
	return async (request: Request, env: any) => {
		const expectedToken = env[envName];
		if (!expectedToken) {
			return error(401, `No env ${envName} set`);
		}

		let token = request.headers.get('Authorization');
		if (!token) {
			const formData = await request.formData();
			token = formData.get('token');
		}

		if (!token === expectedToken) {
			return error(401, 'Not Authorized');
		}
	};
}

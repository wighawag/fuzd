import {env, createExecutionContext, waitOnExecutionContext} from 'cloudflare:test';
import worker from '../src/worker';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
export const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

export async function fetchWorker(req: Request | string, init?: RequestInit, envOverride?: Record<string, string>) {
	let previousEnv: Record<string, string | undefined> | undefined;
	if (envOverride) {
		previousEnv = {};
		for (const key of Object.keys(envOverride)) {
			previousEnv[key] = (env as any)[key];
			(env as any)[key] = envOverride[key];
		}
	}

	let response: Response;
	try {
		let request: Request<unknown, IncomingRequestCfProperties>;
		if (typeof req === 'string') {
			if (req.startsWith('http')) {
				request = new IncomingRequest(req, init as any); // TODO any
			} else {
				if (req.startsWith('/')) {
					request = new IncomingRequest(`http://example.com${req}`, init as any); // TODO any
				} else {
					request = new IncomingRequest(`http://example.com/${req}`, init as any); // TODO any
				}
			}
		} else {
			request = new IncomingRequest(req, init as any); // TODO any
		}
		// Create an empty context to pass to `worker.fetch()`
		const ctx = createExecutionContext();
		response = await worker.fetch(request, env, ctx);

		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
	} finally {
		if (previousEnv) {
			for (const key of Object.keys(previousEnv)) {
				const value = previousEnv[key];
				if (typeof value === 'undefined') {
					delete (env as any)[key];
				} else {
					(env as any)[key] = previousEnv[key];
				}
			}
		}
	}

	return response;
}

export function setupWorker(envOverride?: Record<string, string>): {
	fetch(req: Request | string, init?: RequestInit): Promise<Response>;
} {
	return {
		fetch(req: Request | string, init?: RequestInit) {
			return fetchWorker(req, init, envOverride);
		},
	};
}

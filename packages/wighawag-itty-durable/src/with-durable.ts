import type {RouteHandler, IRequest} from 'itty-router';
import {StatusError} from 'itty-router';
import {proxyDurable} from './proxy-durable';

// returns true if binding appears to be a durable binding
const isDurable = (binding: any) => typeof binding.idFromName === 'function';

export function withDurables<I = IRequest, A extends any[] = any[]>(options: any = {}): RouteHandler<I, A> {
	return (request: I, ...args: A) => {
		const {parse = false, classes = {}} = options;
		(request as any).durables = (request as any).durables || {};

		const env = args[0];
		if (env) {
			for (const [key, binding] of Object.entries(env)) {
				if (isDurable(binding)) {
					const proxied = proxyDurable(binding, {
						name: key,
						class: classes[key], // pass in class key by default
						parse,
					});

					try {
						(request as any)[key] = (request as any).durables[key] = proxied;
					} catch (err) {
						throw new StatusError(500, `Could not set Durable binding "${key}" on Request`);
					}
				}
			}
		}
	};
}

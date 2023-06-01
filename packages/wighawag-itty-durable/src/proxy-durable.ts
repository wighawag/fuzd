import {StatusError} from 'itty-router';

// helper function to parse response
const transformResponse = (response: Response) => {
	try {
		return response.json();
	} catch (err) {}

	try {
		return response.text();
	} catch (err) {}

	return response;
};

// takes the durable (e.g. env.Counter) and returns an object with { get(id) } to fetch the proxied stub
export const proxyDurable = (durable: any, middlewareOptions: any = {}) => {
	if (!durable || !durable.idFromName) {
		throw new StatusError(500, `${middlewareOptions.name || 'That'} is not a valid Durable Object binding.`);
	}

	return {
		get: (id: any, options: any = {}) => {
			options = {...middlewareOptions, ...options};

			const otherHeaders: any = {};

			try {
				if (typeof id === 'string') {
					// should add check for hex id string and handle appropriately
					otherHeaders['itty-durable-idFromName'] = id;
					id = durable.idFromName(id);
				}

				const stub = durable.get(id);
				const mock = typeof options.class === 'function' && new options.class();
				const isValidMethod = (prop: any) => prop !== 'fetch' && (!mock || typeof mock[prop] === 'function');

				const buildRequest = (type: any, prop: any, content: any) =>
					new Request(`https://itty-durable/${type}/${prop}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...otherHeaders,
						},
						body: JSON.stringify(content),
					});

				const stubFetch = (obj: any, type: any, prop: any, content?: any) => {
					const theFetch = obj.fetch(buildRequest(type, prop, content));

					return options.parse ? theFetch.then(transformResponse) : theFetch;
				};

				return new Proxy(stub, {
					get: (obj, prop) =>
						isValidMethod(prop)
							? (...args: any[]) => stubFetch(obj, 'call', prop, args)
							: stubFetch(obj, 'get-prop', prop),
					set: (obj, prop, value) => stubFetch(obj, 'set', prop, value),
				});
			} catch (err) {
				throw new StatusError(500, (err as any).message);
			}
		},
	};
};

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CHAIN_ID, TOKEN_ADMIN, createTestServer, type TestServer} from './utils/server.js';

// Every admin route and dashboard page is behind HTTP Basic auth (user `admin`, password TOKEN_ADMIN).
// The routes are read from the app itself, so a route added later cannot be forgotten here.

const ACCOUNT = `0x${'11'.repeat(20)}`;
const PARAMS: Record<string, string> = {
	account: ACCOUNT,
	broadcaster: ACCOUNT,
	chainId: CHAIN_ID,
	'chainId?': CHAIN_ID,
	slot: 'slot',
	message: 'hello',
	chainOverride: encodeURIComponent('http://fuzd-test-rpc.invalid/#finality=1&worstCaseBlockTime=2'),
};

type Route = {method: string; path: string};

function protectedRoutes(server: TestServer): Route[] {
	const seen = new Set<string>();
	const routes: Route[] = [];
	for (const {method, path} of server.app.routes) {
		// middlewares are registered with method ALL, and with a wildcard path
		if (method === 'ALL' || path.includes('*')) continue;
		if (!path.startsWith('/admin/') && !path.startsWith('/dashboard/')) continue;
		const key = `${method} ${path}`;
		if (seen.has(key)) continue;
		seen.add(key);
		routes.push({method, path});
	}
	return routes;
}

function concrete(path: string): string {
	return path.replace(/:([A-Za-z]+\??)/g, (_, name: string) => {
		const value = PARAMS[name];
		if (value === undefined) throw new Error(`admin-auth test: no sample value for :${name} in ${path}`);
		return value;
	});
}

function request(server: TestServer, route: Route, headers?: Record<string, string>) {
	return server.request(concrete(route.path), {
		method: route.method,
		headers: {...headers, ...(route.method === 'POST' ? {'content-type': 'application/json'} : {})},
		...(route.method === 'POST'
			? {body: JSON.stringify(route.path.includes('updateExpectedGasPrice') ? {value: '0'} : {})}
			: {}),
	});
}

const basic = (user: string, password: string) => ({Authorization: `Basic ${btoa(`${user}:${password}`)}`});

describe('admin routes and dashboard pages', () => {
	let server: TestServer;
	let routes: Route[];
	beforeAll(async () => {
		server = await createTestServer();
		routes = protectedRoutes(server);
	});
	afterAll(() => server?.close());

	it('finds the routes to check', () => {
		const paths = routes.map((v) => v.path);
		// the ones that used to be public
		for (const path of [
			'/admin/queue',
			'/admin/account-submissions/:account',
			'/admin/executions',
			'/admin/all-executions',
			'/admin/test/:message',
			'/dashboard/admin/queue',
			'/dashboard/admin/queue-with-payload',
			'/dashboard/admin/all-submissions',
			'/dashboard/admin/executions',
		]) {
			expect(paths).toContain(path);
		}
	});

	it('refuses an anonymous request with a 401 and a Basic challenge', async () => {
		for (const route of routes) {
			const response = await request(server, route);
			expect({route, status: response.status}).toEqual({route, status: 401});
			expect(response.headers.get('www-authenticate')).toMatch(/^Basic/);
		}
	});

	it('refuses a wrong password or another user with a 401', async () => {
		for (const route of routes) {
			for (const headers of [basic('admin', 'wrong'), basic('root', TOKEN_ADMIN)]) {
				const response = await request(server, route, headers);
				expect({route, status: response.status}).toEqual({route, status: 401});
			}
		}
	});

	it('serves every read page and route to the admin', async () => {
		for (const route of routes) {
			const response = await request(server, route, server.adminHeaders);
			if (route.method === 'GET' && !route.path.includes('setChainOverride')) {
				expect({route, status: response.status}).toEqual({route, status: 200});
			} else {
				expect({route, status: response.status}).not.toEqual({route, status: 401});
			}
		}
	});

	it('does not return the private key of the payment account broadcaster', async () => {
		const payment = await createTestServer({PAYMENT_ACCOUNT: ACCOUNT});
		try {
			const {status, json} = await payment.getJSON('/admin/paymentAccountBroadcaster', {headers: payment.adminHeaders});
			expect(status).toBe(200);
			expect(json.paymentAccountBroadcaster).toEqual({address: expect.stringMatching(/^0x[0-9a-f]{40}$/)});
			expect(JSON.stringify(json)).not.toMatch(/privateKey/i);
		} finally {
			payment.close();
		}
	});
});

describe('without TOKEN_ADMIN', () => {
	let server: TestServer;
	beforeAll(async () => {
		// the harness sets the database up with the admin token first, then forgets it
		server = await createTestServer({}, {forgetAdminTokenAfterSetup: true});
	});
	afterAll(() => server?.close());

	it('refuses every admin route and dashboard page, even with an empty password', async () => {
		const routes = protectedRoutes(server);
		expect(routes.length).toBeGreaterThan(10);
		for (const route of routes) {
			for (const headers of [undefined, basic('admin', ''), basic('admin', 'undefined'), server.adminHeaders]) {
				const response = await request(server, route, headers);
				expect({route, status: response.status}).toEqual({route, status: 401});
			}
		}
	});
});

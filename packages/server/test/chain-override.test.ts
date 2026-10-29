import {afterEach, describe, expect, it} from 'vitest';
import {createTestServer, type TestServer} from './utils/server.js';

// The CLI hands the server its env through getEnv, not as Hono bindings (on node, c.env is the
// raw request), so a route must read the env through getEnv to see DEV.

let server: TestServer | undefined;
afterEach(() => {
	server?.close();
	server = undefined;
});

const chainId = '99999';
const override = encodeURIComponent('http://fuzd-test-rpc.invalid/#finality=1&worstCaseBlockTime=2');

describe('admin/setChainOverride', () => {
	it('adds a chain when the env given to the server says DEV', async () => {
		server = await createTestServer({DEV: 'true'});
		const before = await server.getJSON(`/api/execution/remoteAccount/${chainId}/0x${'11'.repeat(20)}`);
		expect(before.json.success).toBe(false);

		const response = await server.getJSON(`/admin/setChainOverride/${chainId}/${override}`, {
			headers: server.adminHeaders,
		});
		expect(response).toEqual({status: 200, json: {success: true}});

		const after = await server.getJSON(`/api/execution/remoteAccount/${chainId}/0x${'11'.repeat(20)}`);
		expect(after.json.success).toBe(true);
	});

	it('refuses without DEV', async () => {
		server = await createTestServer();
		const response = await server.getJSON(`/admin/setChainOverride/${chainId}/${override}`, {
			headers: server.adminHeaders,
		});
		expect(response.json.success).toBe(false);
	});
});

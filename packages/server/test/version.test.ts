import fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestServer, type TestServer} from './utils/server.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

let server: TestServer;
beforeAll(async () => {
	server = await createTestServer();
});
afterAll(() => {
	server?.close();
});

describe('the version route', () => {
	it("answers this package's version", async () => {
		const response = await server.request('/');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(`fuzd api : ${pkg.version}`);
	});
});

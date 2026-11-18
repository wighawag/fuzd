import {afterEach, describe, expect, it, vi} from 'vitest';
import * as bip39 from '@scure/bip39';
import {createTestServer, CHAIN_ID, type TestServer} from './utils/server.js';

// `setup` runs on every request. Deriving the server account from the mnemonic (PBKDF2 with 2048
// rounds, then the HD path) is most of an idle processing loop's CPU on Cloudflare, so it is done
// once per mnemonic, per isolate or process.

vi.mock('@scure/bip39', async (importOriginal) => {
	const original = await importOriginal<typeof import('@scure/bip39')>();
	return {...original, mnemonicToSeedSync: vi.fn(original.mnemonicToSeedSync)};
});

const derivations = () => vi.mocked(bip39.mnemonicToSeedSync).mock.calls.length;

const servers: TestServer[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

const user = `0x${'22'.repeat(20)}`;

describe('setup', () => {
	it('derives the server account once for many requests', async () => {
		const before = derivations();
		const server = await createTestServer({
			HD_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
		});
		servers.push(server);
		const first = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${user}`);
		const second = await server.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${user}`);
		expect(first.json.success).toBe(true);
		expect(second.json).toEqual(first.json);
		expect(derivations() - before).toBe(1);
	});

	it('derives a different account for a different mnemonic', async () => {
		const a = await createTestServer({
			HD_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
		});
		servers.push(a);
		const b = await createTestServer({HD_MNEMONIC: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'});
		servers.push(b);
		const fromA = await a.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${user}`);
		const fromB = await b.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${user}`);
		const againFromA = await a.getJSON(`/api/execution/remoteAccount/${CHAIN_ID}/${user}`);
		expect(fromA.json.success).toBe(true);
		expect(fromB.json.success).toBe(true);
		expect(fromB.json.account.address).not.toBe(fromA.json.account.address);
		expect(againFromA.json).toEqual(fromA.json);
	});
});

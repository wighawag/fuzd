import {ANVIL_URL} from './prool/pool';

/** A JSON-RPC call to this test file's anvil. */
export async function rpc<T = any>(method: string, params: unknown[] = []): Promise<T> {
	const response = await fetch(ANVIL_URL, {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
	});
	const json = await response.json();
	if (json.error) {
		throw new Error(`${method}: ${json.error.message}`);
	}
	return json.result;
}

/** Give an account 100 ether on anvil. */
export async function fund(address: string) {
	await rpc('anvil_setBalance', [address, '0x56bc75e2d63100000']);
}

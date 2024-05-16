import {JSONRPCHTTPProvider, JSONRPCError} from 'eip-1193-jsonrpc-provider';

const provider = new JSONRPCHTTPProvider('http://localhost:8545');

async function main() {
	try {
		const result = await provider.request({
			method: 'eth_estimateGas',
			params: [
				{
					to: '0xf18058eaf60e826f0afdf2859a80716b587d5359',
					data: '0fffffffffffffffffffff',
				},
			],
		});

		console.log(result);
	} catch (err) {
		if (err instanceof JSONRPCError) {
			console.error('JSONRPCError');
		} else {
			console.error('json.error');
		}
		console.error(err);
	}
}

main();

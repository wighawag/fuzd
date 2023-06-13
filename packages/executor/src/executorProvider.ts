import {RLP} from '@nomicfoundation/ethereumjs-rlp';

function fromHex(str: `0x${string}`): Uint8Array {
	const matches = str.slice(2).match(/.{1,2}/g);
	if (matches) {
		return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
	}
	return new Uint8Array(0);
}

function displayAccessList(access_list: any): string {
	if (access_list) {
		if (access_list.length === 0) {
			return '- empty access list - ';
		} else {
			return access_list
				.map((v: any) =>
					JSON.stringify({
						address: v[0],
						storage_keys: v[1],
					})
				)
				.join('--\n');
		}
	} else {
		return '- no access list -';
	}
}

export function initExecutorProvider() {
	// async function request(req: {method: 'eth_sendMetaTransactionWithFeeStrategy'; params: {}});
	// async function request(req: {method: 'eth_sendRawMetaTransactionWithFeeStrategy'; params: {}});
	async function request(
		req:
			| {method: 'eth_sendMetaTransactionWithFeeStrategy'; params: [{}]}
			| {method: 'eth_sendRawMetaTransactionWithFeeStrategy'; params: [`0x${string}`]}
	) {
		if (req.method === 'eth_sendRawMetaTransactionWithFeeStrategy') {
			const data = req.params[0];
			const uint8Array = fromHex(data);
			const type = uint8Array[0];
			console.log(`----- RLP (${type}) -----`);
			if (type === 2) {
				const decoded = RLP.decode(uint8Array.slice(1));
				// rlp([chain_id, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit, destination, amount, data, access_list, signature_y_parity, signature_r, signature_s])
				console.log({
					chainId: decoded[0],
					nonce: decoded[1],
					max_priority_fee_per_gas: decoded[2],
					max_fee_per_gas: decoded[3],
					gas_limit: decoded[4],
					destination: decoded[5],
					amount: decoded[6],
					data: decoded[7],
					decoded_access_list: displayAccessList(decoded[8]),
					access_list: decoded[8],
					signature_y_parity: decoded[9],
					signature_r: decoded[10],
					signature_s: decoded[11],
				});
			} else if (type === 0x6d) {
				const fullType = uint8Array.slice(0, 4);
				if (fullType[1] === 0x65 && fullType[2] === 0x74 && fullType[3] === 0x61) {
					const decoded = RLP.decode(uint8Array.slice(4));
					// rlp([chain_id, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit, destination, amount, data, access_list, signature_y_parity, signature_r, signature_s])
					console.log({
						chainId: decoded[0],
						feeStrategy: decoded[1],
						gas_limit: decoded[2],
						destination: decoded[3],
						amount: decoded[4],
						data: decoded[5],
						decoded_access_list: displayAccessList(decoded[6]),
						access_list: decoded[6],
						signature_y_parity: decoded[7],
						signature_r: decoded[8],
						signature_s: decoded[9],
					});
				} else {
					throw new Error(`transaction type ${type} need to have the 0x6D657461 prefix`);
				}
			} else {
				throw new Error(`transaction type ${type} not supported`);
			}
			console.log('----------');
		}
	}

	return {
		request,
	};
}

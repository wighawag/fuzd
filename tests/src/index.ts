// import {EIP1193LocalSigner} from 'eip-1193-signer';
// import {executor, executorProvider} from './executor';
// import {RLP} from '@nomicfoundation/ethereumjs-rlp';

// const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
// const signerProvider = new EIP1193LocalSigner(privateKey);
// const address = signerProvider.addresses[0];

// function toHex(arr: Uint8Array): `0x${string}` {
// 	let str = `0x`;
// 	for (const element of arr) {
// 		str += element.toString(16).padStart(2, '0');
// 	}
// 	return str as `0x${string}`;
// }
// function fromHex(str: `0x${string}`): Uint8Array {
// 	const matches = str.slice(2).match(/.{1,2}/g);
// 	if (matches) {
// 		return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
// 	}
// 	return new Uint8Array(0);
// }

// async function main() {
// 	const id = '1'; // TODO id based on player account
// 	const transactionData = {
// 		type: '0x2',
// 		chainId: '0x1',
// 		data: '0x',
// 		to: address,
// 		gas: `0x${(1000000).toString(16)}`,
// 	} as const;
// 	// await executor.submitTransaction(id, address, transactionData, {
// 	// 	type: 'single',
// 	// 	maxFeePerGas: 1n,
// 	// 	maxPriorityFeePerGas: 1n,
// 	// });

// 	const rawTx = await signerProvider.request({
// 		method: 'eth_signTransaction',
// 		params: [
// 			{
// 				...transactionData,
// 				type: '0x2',
// 				from: address,
// 				maxFeePerGas: '0x0',
// 				maxPriorityFeePerGas: '0x0',
// 				accessList: [
// 					{
// 						address: address,
// 						storageKeys: [
// 							'0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
// 							'0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00',
// 						],
// 					},
// 				],
// 			},
// 		],
// 	});
// 	await executorProvider.request({
// 		method: 'eth_sendRawMetaTransactionWithFeeStrategy',
// 		params: [rawTx],
// 	});

// 	const rlpTest = RLP.encode([
// 		new Uint8Array([1]),
// 		[[new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([0])]],
// 		new Uint8Array(0),
// 		new Uint8Array([2, 4, 5, 6]),
// 		new Uint8Array([2, 4, 5, 6]),
// 		new Uint8Array([2, 4, 5, 6]),
// 		[[new Uint8Array([1]), [new Uint8Array([2]), new Uint8Array([0])]]],
// 	]);
// 	await executorProvider.request({
// 		method: 'eth_sendRawMetaTransactionWithFeeStrategy',
// 		params: [(`0x6D657461` + toHex(rlpTest).slice(2)) as `0x${string}`],
// 	});
// }

// main();

// // const scheduler = create
// /*
// tx: {
// 			type: 'clear',
// 			data: '0x',
// 			to: '0x',
// 			feeStrategy: {
// 				type: 'single',
// 				maxFeePerGas: 1n,
// 				maxPriorityFeePerGas: 1n,
// 			},
// 			gas: 1000000,
// 		},
// 		timing: {
// 			type: 'fixed',
// 			timestamp: 1,
// 		},
// */

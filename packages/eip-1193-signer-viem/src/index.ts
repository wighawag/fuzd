import {EIP1193TransactionDataToSign, EIP1193Signer} from 'eip-1193-signer';
import {TransactionSerializable} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

export function createWallet(privateKey: `0x${string}`): EIP1193Signer {
	const account = privateKeyToAccount(privateKey);
	const wallet = {
		address: account.address,
		async signTransaction(tx: EIP1193TransactionDataToSign) {
			let viemTransaction: TransactionSerializable | undefined;
			if (!tx.type || tx.type === '0x0') {
				viemTransaction = {
					type: 'legacy',
					to: tx.to,
					data: tx.data,
					gas: tx.gas && BigInt(tx.gas),
					gasPrice: tx.gasPrice && BigInt(tx.gasPrice),
					nonce: tx.nonce && Number(BigInt(tx.nonce)),
					value: tx.value && BigInt(tx.value),
				};
			} else if (tx.type === '0x1') {
				viemTransaction = {
					type: 'eip2930',
					to: tx.to,
					chainId: Number(BigInt(tx.chainId)),
					accessList: tx.accessList,
					data: tx.data,
					gas: tx.gas && BigInt(tx.gas),
					gasPrice: tx.gasPrice && BigInt(tx.gasPrice),
					nonce: tx.nonce && Number(BigInt(tx.nonce)),
					value: tx.value && BigInt(tx.value),
				};
			} else if (tx.type === '0x2') {
				viemTransaction = {
					type: 'eip1559',
					to: tx.to,
					chainId: tx.chainId && Number(BigInt(tx.chainId)),
					accessList: tx.accessList,
					data: tx.data,
					gas: tx.gas && BigInt(tx.gas),
					maxFeePerGas: tx.maxFeePerGas && BigInt(tx.maxFeePerGas),
					maxPriorityFeePerGas: tx.maxPriorityFeePerGas && BigInt(tx.maxPriorityFeePerGas),
					nonce: tx.nonce && Number(BigInt(tx.nonce)),
					value: tx.value && BigInt(tx.value),
				};
			}
			if (!viemTransaction) {
				throw new Error(`could not create tx data for type ${tx.type}`);
			}

			const signedTx = await account.signTransaction(viemTransaction);
			return signedTx;
		},
	};

	return wallet;
}

import {EIP1193LegacyTransactionData, EIP1193TransactionDataOfType1, EIP1193TransactionDataOfType2} from 'eip-1193';

export type EIP1193TransactionDataToSign = {chainId: string} & (
	| Omit<EIP1193LegacyTransactionData, 'from'>
	| Omit<EIP1193TransactionDataOfType1, 'from'>
	| Omit<EIP1193TransactionDataOfType2, 'from'>
);

export type EIP1193Signer = {
	address: `0x${string}`;
	signTransaction(tx: EIP1193TransactionDataToSign): Promise<`0x${string}`>;
};

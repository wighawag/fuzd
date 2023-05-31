import {EIP1193LegacyTransactionData, EIP1193TransactionDataOfType1, EIP1193TransactionDataOfType2} from 'eip-1193';

export type TransactionData = {chainId: string} & (
	| Omit<EIP1193LegacyTransactionData, 'from'>
	| Omit<EIP1193TransactionDataOfType1, 'from'>
	| Omit<EIP1193TransactionDataOfType2, 'from'>
);

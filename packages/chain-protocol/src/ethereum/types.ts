import {EIP1193TransactionData} from 'eip-1193';

// ------------------------------------------------------------------------------------------------
// TransactionData
// ------------------------------------------------------------------------------------------------
export type TransactionData = {
	type: '0x2';
	to?: `0x${string}`;
	gas: `0x${string}`;
	data?: `0x${string}`;
	value?: `0x${string}`;
	accessList?: {
		address: `0x${string}`;
		storageKeys: [`0x${string}`, ...`0x${string}`[]];
	}[];
};
// ------------------------------------------------------------------------------------------------

export type FullTransactionData = EIP1193TransactionData;

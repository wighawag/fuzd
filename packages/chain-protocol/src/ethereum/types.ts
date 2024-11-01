import {EIP1193TransactionData} from 'eip-1193';
import {String0x} from 'fuzd-common';

// ------------------------------------------------------------------------------------------------
// TransactionData
// ------------------------------------------------------------------------------------------------
export type EthereumTransactionData = {
	type: '0x2';
	to?: String0x;
	gas: String0x;
	data?: String0x;
	value?: String0x;
	accessList?: {
		address: String0x;
		storageKeys: [String0x, ...String0x[]];
	}[];
};
// ------------------------------------------------------------------------------------------------

export type FullEthereumTransactionData = EIP1193TransactionData;

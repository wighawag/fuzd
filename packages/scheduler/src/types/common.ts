import {EIP1193Account} from 'eip-1193';

export type Executor<TransactionDataType, TransactionInfoType> = {
	submitTransaction(
		slot: string,
		account: EIP1193Account,
		submission: TransactionDataType,
	): Promise<TransactionInfoType>;
};

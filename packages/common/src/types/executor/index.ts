import {EIP1193Account} from 'eip-1193';

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType, TransactionInfoType> = {
	submitTransaction(
		slot: string,
		account: EIP1193Account,
		submission: TransactionDataType,
	): Promise<TransactionInfoType>;
};
// ------------------------------------------------------------------------------------------------

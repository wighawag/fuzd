import {EIP1193Account} from 'eip-1193';

export type Time = {
	getTimestamp(): Promise<number>;
};

export type Executor<TransactionDataType, TransactionInfoType> = {
	submitTransaction(id: string, account: EIP1193Account, submission: TransactionDataType): Promise<TransactionInfoType>;
};
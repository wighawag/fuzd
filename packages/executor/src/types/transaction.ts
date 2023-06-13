import {EIP1193Transaction, EIP1193TransactionData, EIP1193TransactionReceipt} from 'eip-1193';

export interface TransactionBroadcaster {
	submitTransaction(txData: EIP1193TransactionData): Promise<`0x${string}`>;
	getTransaction(id: string): Promise<EIP1193Transaction | null>;
	getTransactionReceipt(id: string): Promise<EIP1193TransactionReceipt | null>;
}

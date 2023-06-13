import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents, EIP1193SignerProvider} from 'eip-1193';
import {EIP1193TransactionDataUsed, ExecutionTransactionData, ExecutorStorage} from './executor-storage';
import {FeeStrategy, Time} from './common';

export type TransactionInfo = {
	hash: EIP1193DATA;
	broadcastTime: number;
	transactionData: EIP1193TransactionDataUsed;
	isVoidTransaction: boolean;
};

export type RawTransactionInfo = {
	rawTx: EIP1193DATA;
	transactionData: EIP1193TransactionDataUsed;
	isVoidTransaction: boolean;
};

export type ExecutorConfig = {
	chainId: string;
	provider: EIP1193ProviderWithoutEvents;
	time: Time;
	storage: ExecutorStorage;
	getSignerProvider: (account: EIP1193Account) => Promise<EIP1193SignerProvider>;
	finality: number;
	worstCaseBlockTime: number;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};

export type Executor = {
	submitTransaction(
		id: string,
		account: EIP1193Account,
		executionTransactionData: ExecutionTransactionData,
		feeStrategy: FeeStrategy
	): Promise<TransactionInfo>;
};

export type ExecutorBackend = {
	processPendingTransactions(): Promise<void>;
};

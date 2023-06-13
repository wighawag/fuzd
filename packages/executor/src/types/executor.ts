import {
	EIP1193Account,
	EIP1193DATA,
	EIP1193ProviderWithoutEvents,
	EIP1193QUANTITY,
	EIP1193SignerProvider,
	EIP1193TransactionDataOfType2,
} from 'eip-1193';
import {EIP1193TransactionDataUsed, ExecutorStorage} from './executor-storage';
import {Time} from './common';

export type FeePerGas = {
	maxFeePerGas: EIP1193QUANTITY;
	maxPriorityFeePerGas: EIP1193QUANTITY;
};

export type FeePerGasPeriod = FeePerGas & {duration: EIP1193QUANTITY};

export type BroadcastSchedule = FeePerGasPeriod[];

export type ExecutionSubmission = Omit<
	EIP1193TransactionDataOfType2,
	'nonce' | 'from' | 'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
> & {broadcastSchedule: BroadcastSchedule};

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
	submitTransaction(id: string, account: EIP1193Account, submission: ExecutionSubmission): Promise<TransactionInfo>;
};

export type ExecutorBackend = {
	processPendingTransactions(): Promise<void>;
};

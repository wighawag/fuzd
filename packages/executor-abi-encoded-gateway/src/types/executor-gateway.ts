import type {TransactionInfo, TransactionSubmission} from 'fuzd-executor';

export type SignedTransactionSubmission = TransactionSubmission & {signature: `0x${string}`};

export type ExecutorGateway = {
	submitSignedTransaction(id: string, submission: SignedTransactionSubmission): Promise<TransactionInfo>;
};

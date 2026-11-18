// ------------------------------------------------------------------------------------------------
// RawTransactionInfo

import {PendingExecutionStored, String0x} from '@fuzd/common';

// ------------------------------------------------------------------------------------------------
export type RawTransactionInfo<TransactionDataType> = {
	rawTx: String0x;
	transactionData: TransactionDataType;
	isVoidTransaction: boolean;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutorBackend
// ------------------------------------------------------------------------------------------------
export type PendingTransactionsProcessingResult<TransactionDataType = unknown> = {
	/** the pending executions this run checked */
	executions: PendingExecutionStored<TransactionDataType>[];
	/** the run stopped on its budget, not for lack of due work: more may be due, run again at once */
	budgetExhausted: boolean;
};

export type ExecutorBackend = {
	processPendingTransactions(): Promise<PendingTransactionsProcessingResult>;
};
// ------------------------------------------------------------------------------------------------

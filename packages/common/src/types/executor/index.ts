import {EIP1193Account} from 'eip-1193';

export type ExpectedWorstCaseGasPrice =
	| {current: bigint; updateTimestamp: number; previous: undefined}
	| {previous: undefined; current: undefined; updateTimestamp: undefined}
	| {previous: bigint; current: bigint; updateTimestamp: number};

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType, TransactionSubmissionResponseType> = {
	submitTransaction(
		slot: string,
		account: EIP1193Account,
		submission: TransactionDataType,
	): Promise<TransactionSubmissionResponseType>;

	getExpectedWorstCaseGasPrice?(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice>;
};
// ------------------------------------------------------------------------------------------------

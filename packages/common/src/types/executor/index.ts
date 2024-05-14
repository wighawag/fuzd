import {EIP1193Account, EIP1193TransactionDataOfType2} from 'eip-1193';
import {RequiredKeys} from '../utils';

// export type EIP1193TransactionDataUsed =
// 	| RequiredKeys<EIP1193LegacyTransactionData, 'nonce' | 'gasPrice'>
// 	| RequiredKeys<EIP1193TransactionDataOfType1, 'nonce' | 'gasPrice'>
// 	| RequiredKeys<EIP1193TransactionDataOfType2, 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>;
export type EIP1193TransactionDataUsed = RequiredKeys<
	EIP1193TransactionDataOfType2,
	'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gas' | 'chainId' | 'from' | 'type'
>;

export type EIP1193TransactionToFill = Omit<
	EIP1193TransactionDataUsed,
	'nonce' | 'from' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
>;

export type ExpectedWorstCaseGasPrice =
	| {current: bigint; updateTimestamp: number; previous: undefined}
	| {previous: undefined; current: undefined; updateTimestamp: undefined}
	| {previous: bigint; current: bigint; updateTimestamp: number};

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionSubmissionDataType, TransactionSubmissionResponseType> = {
	submitTransaction(
		slot: string,
		account: EIP1193Account,
		submission: TransactionSubmissionDataType,
		options?: {
			expectedWorstCaseGasPrice?: bigint;
		},
	): Promise<TransactionSubmissionResponseType>;

	getExpectedWorstCaseGasPrice?(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice>;
};
// ------------------------------------------------------------------------------------------------

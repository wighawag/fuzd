import {ExecutionSubmission, Executor} from 'fuzd-common';
import {Decrypter} from './external.js';
import {SchedulerStorage} from './scheduler-storage.js';
import type {ChainProtocol} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------
// ChainProtocols
// ------------------------------------------------------------------------------------------------
export type ChainProtocols = {
	[chainId: `0x${string}`]: ChainProtocol<any>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerConfig<
// ------------------------------------------------------------------------------------------------
export type SchedulerConfig<
	TransactionDataType,
	ExecutionSubmissionType extends ExecutionSubmission<TransactionDataType> = ExecutionSubmission<TransactionDataType>,
> = {
	executor: Executor<TransactionDataType>;
	chainProtocols: ChainProtocols;
	decrypter?: Decrypter<ExecutionSubmissionType>;
	storage: SchedulerStorage<TransactionDataType>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
// ------------------------------------------------------------------------------------------------

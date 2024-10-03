import {ExecutionSubmission, Executor} from 'fuzd-common';
import {Decrypter} from './external';
import {SchedulerStorage} from './scheduler-storage';
import type {ChainProtocol} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------
// ChainProtocols
// ------------------------------------------------------------------------------------------------
// TODO zod ?
export type ChainProtocols = {
	[chainId: `0x${string}`]: ChainProtocol;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerConfig<
// ------------------------------------------------------------------------------------------------
// TODO zod ?
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

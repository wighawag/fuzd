import {Executor} from 'fuzd-common';
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
export type SchedulerConfig<ExecutionDataType, TransactionInfoType> = {
	executor: Executor<ExecutionDataType, TransactionInfoType>;
	chainProtocols: ChainProtocols;
	decrypter?: Decrypter<ExecutionDataType>;
	storage: SchedulerStorage<ExecutionDataType>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
// ------------------------------------------------------------------------------------------------

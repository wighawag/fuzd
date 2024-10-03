import {ExecutorStorage} from './executor-storage';
import {ChainProtocol} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------
// ExecutorConfig
export type ExecutorConfig<TransactionDataType> = {
	chainProtocols: ChainProtocols;
	storage: ExecutorStorage<TransactionDataType>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
	paymentAccount?: `0x${string}`;
};

// ------------------------------------------------------------------------------------------------
// ChainProtocols
// ------------------------------------------------------------------------------------------------
export type ChainProtocols = {
	[chainId: `0x${string}`]: ChainProtocol;
};
// ------------------------------------------------------------------------------------------------

import {ExecutorStorage} from './executor-storage.js';
import {ChainProtocol, ChainProtocols, TransactionDataTypes} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------
// ExecutorConfig
export type ExecutorConfig<ChainProtocolTypes extends ChainProtocol<any>> = {
	chainProtocols: ChainProtocols<ChainProtocolTypes>;
	storage: ExecutorStorage<TransactionDataTypes<ChainProtocolTypes>>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
	paymentAccount?: `0x${string}`;
};

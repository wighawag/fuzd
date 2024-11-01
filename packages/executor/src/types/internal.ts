import {String0x} from 'fuzd-common';
import {ExecutorStorage} from './executor-storage.js';
import {ChainProtocol, ChainProtocols, TransactionDataTypes} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------
// ExecutorConfig
export type ExecutorConfig<ChainProtocolTypes extends ChainProtocol<any>> = {
	chainProtocols: ChainProtocols<ChainProtocolTypes>;
	storage: ExecutorStorage<TransactionDataTypes<ChainProtocolTypes>>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
	paymentAccount?: String0x;
};

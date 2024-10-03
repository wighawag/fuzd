import {ExecutorStorage} from './executor-storage';
import {EIP1193SignerProvider} from 'eip-1193'; // TODO ChainProtocol
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

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {assignerID: string; signer: EIP1193SignerProvider; address: `0x${string}`};
// ------------------------------------------------------------------------------------------------

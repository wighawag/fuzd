import {ExecutorStorage} from './executor-storage';
import {EIP1193SignerProvider} from 'eip-1193'; // TODO move to ChainProtocol
import {ChainProtocol} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------
// ExecutorConfig
export type ExecutorConfig = {
	chainProtocols: ChainProtocols;
	storage: ExecutorStorage;
	signers: Signers;
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
// Signers
// ------------------------------------------------------------------------------------------------
export type Signers = {
	assignProviderFor: (chainId: `0x${string}`, account: `0x${string}`) => Promise<BroadcasterSignerData>;
	getProviderByAssignerID: (assignerID: string, address: `0x${string}`) => Promise<BroadcasterSignerData>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {assignerID: string; signer: EIP1193SignerProvider; address: `0x${string}`};
// ------------------------------------------------------------------------------------------------

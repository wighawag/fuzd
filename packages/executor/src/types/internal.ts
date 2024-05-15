// ------------------------------------------------------------------------------------------------
// ExecutorConfig

import {Time} from 'fuzd-common';
import {ExecutorStorage} from './executor-storage';
import {EIP1193Account, EIP1193ProviderWithoutEvents, EIP1193SignerProvider} from 'eip-1193';

// ------------------------------------------------------------------------------------------------
export type ExecutorConfig = {
	chainConfigs: ChainConfigs;
	time: Time;
	storage: ExecutorStorage;
	signers: Signers;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
	paymentAccount?: `0x${string}`;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfig
// ------------------------------------------------------------------------------------------------
export type ChainConfig = {
	provider: EIP1193ProviderWithoutEvents;
	finality: number;
	worstCaseBlockTime: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfigs
// ------------------------------------------------------------------------------------------------
export type ChainConfigs = {
	[chainId: `0x${string}`]: ChainConfig;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Signers
// ------------------------------------------------------------------------------------------------
export type Signers = {
	assignProviderFor: (chainId: `0x${string}`, account: EIP1193Account) => Promise<BroadcasterSignerData>;
	getProviderByAssignerID: (assignerID: string, address: EIP1193Account) => Promise<BroadcasterSignerData>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// BroadcasterSignerData
// ------------------------------------------------------------------------------------------------
export type BroadcasterSignerData = {assignerID: string; signer: EIP1193SignerProvider; address: EIP1193Account};
// ------------------------------------------------------------------------------------------------

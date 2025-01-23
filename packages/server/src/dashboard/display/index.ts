import {PendingExecutionStored} from 'fuzd-common';
import {ScheduledExecutionQueued} from 'fuzd-scheduler';
import {formatEther, formatUnits, zeroAddress} from 'viem';
import {Config} from '../../setup.js';

export function displayScheduledExecutionQueued<TransactionDataType>(
	timeDiff: number,
	showPayload: boolean,
	config: Config,
) {
	return async (v: ScheduledExecutionQueued<TransactionDataType>) => {
		const {address: remoteAccount} = await config.executor.getRemoteAccount(v.chainId, v.account);
		return {
			account: v.account,
			remoteAccount,
			onBehalf: v.onBehalf,
			chainId: v.chainId,
			slot: v.slot,
			type: v.type,
			broadcasted: v.broadcasted ? (v.finalized ? 'finalized' : 'broadcasted') : 'not broadcasted',
			lastError: v.lastError ? v.lastError : 'no error',
			checkinTime: new Date((v.checkinTime - timeDiff) * 1000).toUTCString(),
			timing: JSON.stringify(v.timing),
			executionServiceParameters: JSON.stringify(v.executionServiceParameters),
			paymentReserve: v.paymentReserve ? v.paymentReserve.amount : 'undefined',
			retries: v.retries || 0,
			payload: showPayload ? (v.type === 'clear' ? JSON.stringify(v.executions) : v.payload) : undefined,
			priorTransactionConfirmation: v.priorTransactionConfirmation
				? JSON.stringify(v.priorTransactionConfirmation)
				: 'none',
			// finalized: v.finalized,
		};
	};
}

export function displayExecutionBroadcasted(config: Config) {
	// TODO any should handle transaction type
	return async (v: PendingExecutionStored<any>) => {
		const {address: remoteAccount} = await config.executor.getRemoteAccount(v.chainId, v.account);
		return {
			account: v.account,
			remoteAccount,
			chainId: v.chainId,
			slot: v.slot,
			nextCheckTime: new Date(v.nextCheckTime * 1000).toUTCString(),
			initialTime: new Date(v.initialTime * 1000).toUTCString(),
			broadcastTime: v.broadcastTime ? new Date(v.broadcastTime * 1000).toUTCString() : 'not broadcasted yet',
			hash: v.hash,
			transaction: {
				// TODO show different starknet/ethereum
				from: v.transaction.from,
				to: v.transaction.to,
				gas: v.transaction.gas,
				value: v.transaction.value ? formatEther(BigInt(v.transaction.value)) : '0',
				nonce: v.transaction.nonce,
				// data: v.data || 'None',
				maxFeePerGas: v.transaction.maxFeePerGas
					? formatEther(BigInt(v.transaction.maxFeePerGas), 'gwei') + ' gwei'
					: 'undefined',
				maxPriorityFeePerGas: v.transaction.maxPriorityFeePerGas
					? formatEther(BigInt(v.transaction.maxPriorityFeePerGas), 'gwei') + ' gwei'
					: 'undefined',
			},
			serviceParameters: v.serviceParameters,
			maxFeePerGasAuthorized: v.maxFeePerGasAuthorized,
			isVoidTransaction: v.isVoidTransaction ? 'true' : 'false',
			retries: v.retries || 0,
			lastError: v.lastError || 'no error',
			expiryTime: v.expiryTime ? new Date(v.expiryTime * 1000).toUTCString() : 'no expiry',
			finalized: v.finalized ? 'true' : 'false',
		};
	};
}

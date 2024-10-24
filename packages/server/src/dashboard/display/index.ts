import {PendingExecutionStored} from 'fuzd-common';
import {ScheduledExecutionQueued} from 'fuzd-scheduler';
import {formatEther, formatUnits, zeroAddress} from 'viem';

export function displayScheduledExecutionQueued<TransactionDataType>(timeDiff: number = 0, showPayload = false) {
	return (v: ScheduledExecutionQueued<TransactionDataType>) => ({
		account: v.account,
		chainId: v.chainId,
		slot: v.slot,
		type: v.type,
		broadcasted: v.broadcasted ? (v.finalized ? 'finalized' : 'broadcasted') : 'not broadcasted',
		checkinTime: new Date((v.checkinTime - timeDiff) * 1000).toUTCString(),
		timingType: v.timing.type,
		expectedWorstCaseGasPrice: v.expectedWorstCaseGasPrice || 'none',
		paymentReserve: v.paymentReserve || 'undefined',
		retries: v.retries || 0,
		payload: showPayload ? (v.type === 'clear' ? JSON.stringify(v.executions) : v.payload) : undefined,
	});
}

export function displayExecutionBroadcasted() {
	// TODO any should handle transaction type
	return (v: PendingExecutionStored<any>) => ({
		account: v.account,
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
			maxFeePerGas: formatEther(BigInt(v.transaction.maxFeePerGas), 'gwei') + ' gwei',
			maxPriorityFeePerGas: formatEther(BigInt(v.transaction.maxPriorityFeePerGas), 'gwei') + ' gwei',
		},
		broadcasterAssignerID: v.broadcasterAssignerID,
		maxFeePerGasAuthorized: v.maxFeePerGasAuthorized,
		isVoidTransaction: v.isVoidTransaction ? 'true' : 'false',
		retries: v.retries || 0,
		lastError: v.lastError || 'no error',
		expiryTime: v.expiryTime ? new Date(v.expiryTime * 1000).toUTCString() : 'no expiry',
	});
}

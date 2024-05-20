import {PendingExecutionStored} from 'fuzd-executor';
import {ScheduledExecutionQueued} from 'fuzd-scheduler';
import {formatEther, formatUnits, zeroAddress} from 'viem';

export function displayScheduledExecutionQueued<TransactionData>(timeDiff: number = 0) {
	return (v: ScheduledExecutionQueued<TransactionData>) => ({
		account: v.account,
		chainId: v.chainId,
		slot: v.slot,
		type: v.type,
		broadcasted: v.broadcasted.toString(),
		checkinTime: new Date((v.checkinTime - timeDiff) * 1000).toUTCString(),
		timingType: v.timing.type,
		expectedWorstCaseGasPrice: v.expectedWorstCaseGasPrice || 'none',
		paymentReserve: v.paymentReserve || 'undefined',
		retries: v.retries || 0,
	});
}

export function displayExecutionBroadcasted() {
	return (v: PendingExecutionStored) => ({
		account: v.account,
		chainId: v.chainId,
		slot: v.slot,
		nextCheckTime: new Date(v.nextCheckTime * 1000).toUTCString(),
		initialTime: new Date(v.initialTime * 1000).toUTCString(),
		broadcastTime: v.broadcastTime ? new Date(v.broadcastTime * 1000).toUTCString() : 'not broadcasted yet',
		hash: v.hash,
		transaction: {
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

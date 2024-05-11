import {PendingExecutionStored} from 'fuzd-executor';
import {ExecutionQueued} from 'fuzd-scheduler';
import {formatEther, formatUnits, zeroAddress} from 'viem';

export function displayExecutionQueued<TransactionData>(timeDiff: number = 0) {
	return (v: ExecutionQueued<TransactionData>) => ({
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
		from: v.from,
		to: v.to || zeroAddress,
		gas: v.gas,
		value: v.value ? formatEther(BigInt(v.value)) : '0',
		// data: v.data || 'None',
		nonce: v.nonce,
		maxFeePerGas: formatEther(BigInt(v.maxFeePerGas), 'gwei') + ' gwei',
		maxPriorityFeePerGas: formatEther(BigInt(v.maxPriorityFeePerGas), 'gwei') + ' gwei',
		broadcasterAssignerID: v.broadcasterAssignerID,
		broadcastSchedule: JSON.stringify(v.broadcastSchedule),
		isVoidTransaction: v.isVoidTransaction ? 'true' : 'false',
		retries: v.retries || 0,
		lastError: v.lastError || 'no error',
		expiryTime: v.expiryTime ? new Date(v.expiryTime * 1000).toUTCString() : 'no expiry',
	});
}

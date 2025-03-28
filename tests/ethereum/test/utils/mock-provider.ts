import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {keccak_256} from '@noble/hashes/sha3';
import {ExecutionSubmission} from 'fuzd-common';
import {Decrypter, DecryptionResult, ScheduledExecutionQueued} from 'fuzd-scheduler';

function toHex(arr: Uint8Array): String0x {
	let str = `0x`;
	for (const element of arr) {
		str += element.toString(16).padStart(2, '0');
	}
	return str as String0x;
}
function fromHex(str: String0x): Uint8Array {
	const matches = str.slice(2).match(/.{1,2}/g);
	if (matches) {
		return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
	}
	return new Uint8Array(0);
}

export function hashRawTx(rawTx: String0x): String0x {
	return toHex(keccak_256(fromHex(rawTx)));
}

export type ProviderOverrideHandler = {
	[method: string]: ((provider: EIP1193ProviderWithoutEvents, params: any[]) => Promise<any>) | undefined;
};
export type ProviderExtender = {
	using(handler: ProviderOverrideHandler): EIP1193ProviderWithoutEvents;
	override(handler: ProviderOverrideHandler): void;
	removeOverride(): void;
};

export function overrideProvider(
	provider: EIP1193ProviderWithoutEvents,
	handler?: ProviderOverrideHandler,
): EIP1193ProviderWithoutEvents & ProviderExtender {
	const actualHandler = handler || {};
	let tmpHandler = {};
	const obj = {} as any;
	async function request(args: {method: string; params: any[]}): Promise<any> {
		const tmpHandle = tmpHandler[args.method];
		if (tmpHandle) {
			return tmpHandle(provider, args.params);
		}

		const handle = actualHandler[args.method];
		if (handle) {
			return handle(provider, args.params);
		}

		return provider.request(args);
	}
	function using(handler: ProviderOverrideHandler): EIP1193ProviderWithoutEvents & ProviderExtender {
		return overrideProvider(obj, handler);
	}
	function override(moreHandler: ProviderOverrideHandler) {
		tmpHandler = {};
		for (const key of Object.keys(moreHandler)) {
			tmpHandler[key] = moreHandler[key];
		}
	}
	function removeOverride() {
		tmpHandler = {};
	}
	obj.request = request;
	obj.using = using;
	obj.override = override;
	obj.removeOverride = removeOverride;
	return obj;
}

export function createMockDecrypter<TransactionDataType>(): Decrypter<ExecutionSubmission<TransactionDataType>> & {
	addDecryptedResult(id: string, transaction: ExecutionSubmission<TransactionDataType>): void;
} {
	const map: {[id: string]: ExecutionSubmission<TransactionDataType>} = {};
	function addDecryptedResult(id: string, transaction: ExecutionSubmission<TransactionDataType>) {
		map[id] = transaction;
	}

	async function decrypt(
		scheduledExecution: ScheduledExecutionQueued<ExecutionSubmission<TransactionDataType>>,
	): Promise<DecryptionResult<ExecutionSubmission<TransactionDataType>>> {
		const execution = map[scheduledExecution.slot];
		if (execution) {
			return {
				success: true,
				executions: [execution],
			};
		} else {
			return {
				success: false,
				// TODO retry ?
			};
		}
	}
	return {
		decrypt,
		addDecryptedResult,
	};
}

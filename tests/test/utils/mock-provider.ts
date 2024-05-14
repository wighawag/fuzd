import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {keccak_256} from '@noble/hashes/sha3';
import {ExecutionSubmission} from 'fuzd-executor';
import {Decrypter, DecryptionResult, ScheduledExecutionQueued} from 'fuzd-scheduler';

function toHex(arr: Uint8Array): `0x${string}` {
	let str = `0x`;
	for (const element of arr) {
		str += element.toString(16).padStart(2, '0');
	}
	return str as `0x${string}`;
}
function fromHex(str: `0x${string}`): Uint8Array {
	const matches = str.slice(2).match(/.{1,2}/g);
	if (matches) {
		return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
	}
	return new Uint8Array(0);
}

export function hashRawTx(rawTx: `0x${string}`): `0x${string}` {
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

export function createMockDecrypter(): Decrypter<ExecutionSubmission> & {
	addDecryptedResult(id: string, transaction: ExecutionSubmission): void;
} {
	const map: {[id: string]: ExecutionSubmission} = {};
	function addDecryptedResult(id: string, transaction: ExecutionSubmission) {
		map[id] = transaction;
	}

	async function decrypt(
		scheduledExecution: ScheduledExecutionQueued<ExecutionSubmission>,
	): Promise<DecryptionResult<ExecutionSubmission>> {
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

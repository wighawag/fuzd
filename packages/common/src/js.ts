import {String0x} from './types/index.js';

export function dequals(a: any, b: any): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a != 'object' || typeof b != 'object' || a == null || b == null) {
		return false;
	}

	const keysForA = Object.keys(a);
	const keysForB = Object.keys(b);

	if (keysForA.length != keysForB.length) {
		return false;
	}

	for (const key of keysForA) {
		if (!keysForB.includes(key)) {
			return false;
		}

		if (typeof a[key] === 'function' || typeof b[key] === 'function') {
			if (a[key] !== b[key]) {
				return false;
			}
		} else {
			if (!dequals(a[key], b[key])) {
				return false;
			}
		}
	}
	return true;
}

export function toHex(arr: Uint8Array): String0x {
	let str = `0x`;
	for (const element of arr) {
		str += element.toString(16).padStart(2, '0');
	}
	return str as String0x;
}

export function fromHex(str: String0x): Uint8Array {
	const matches = str.slice(2).match(/.{1,2}/g);
	if (matches) {
		return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
	}
	return new Uint8Array(0);
}

export function numToHex(num: number): String0x {
	return `0x${num.toString(16)}` as String0x;
}

export function bigintToHex(num: BigInt): String0x {
	return `0x${num.toString(16)}` as String0x;
}

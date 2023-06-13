import {HDKey} from '@scure/bip32';
import {keccak_256} from '@noble/hashes/sha3';
import {ProjectivePoint} from '@noble/secp256k1';

const _7FFFFFFF = BigInt('0x7FFFFFFF');
const _1F = BigInt('0x1F');
export function pathFromAddress(address: `0x${string}`) {
	const addressAsNumber = BigInt(address);
	const parts = [
		addressAsNumber >> 129n,
		(addressAsNumber >> 98n) & _7FFFFFFF,
		(addressAsNumber >> 67n) & _7FFFFFFF,
		(addressAsNumber >> 36n) & _7FFFFFFF,
		(addressAsNumber >> 5n) & _7FFFFFFF,
		addressAsNumber & _1F,
	]
		.map((v) => v.toString())
		.join('/');
	return `m/${parts}`;
}

function toHex(arr: Uint8Array): `0x${string}` {
	let str = `0x`;
	for (const element of arr) {
		str += element.toString(16).padStart(2, '0');
	}
	return str as `0x${string}`;
}

export function deriveRemoteKeyAsPublic(publicExtendedKey: string, address: `0x${string}`) {
	const publicOnlyKey = HDKey.fromExtendedKey(publicExtendedKey);
	return publicOnlyKey.derive(pathFromAddress(address));
}

export function deriveRemoteAddress(publicExtendedKey: string, address: `0x${string}`) {
	const accountHD = deriveRemoteKeyAsPublic(publicExtendedKey, address);
	if (!accountHD.publicKey) {
		throw new Error(`could not get public key from account with dervided account: ${publicExtendedKey} / ${address}`);
	}
	const publicKey = toHex(accountHD.publicKey);
	// const publicKeyRaw = toHex(ProjectivePoint.fromHex(publicKey.slice(2)).toRawBytes(false));
	// return keccak256((`0x` + publicKeyRaw.slice(4)) as `0x${string}`).slice(26) as `0x${string}`;
	const publicKeyRaw = ProjectivePoint.fromHex(publicKey.slice(2)).toRawBytes(false);
	return (`0x` + toHex(keccak_256(publicKeyRaw.slice(1))).slice(26)) as `0x${string}`;
}

export function initKeyFromHD(hdkey: HDKey) {
	if (!hdkey.publicKey) {
		throw new Error(`invalid hdkey provided, no public key`);
	}
	if (!hdkey.privateKey) {
		throw new Error(`invalid hdkey provided, no private key`);
	}
	const privateKey = toHex(hdkey.privateKey);
	const publicKey = toHex(hdkey.publicKey);
	const publicExtendedKey = hdkey.publicExtendedKey;

	// const publicKeyRaw = ProjectivePoint.fromHex(publicKey.slice(2)).toRawBytes(false);
	// const address = (`0x` + keccak256((`0x` + toHex(publicKeyRaw).slice(4)) as `0x${string}`).slice(26)) as `0x${string}`;
	const publicKeyRaw = ProjectivePoint.fromHex(publicKey.slice(2)).toRawBytes(false);
	const address = (`0x` + toHex(keccak_256(publicKeyRaw.slice(1))).slice(26)) as `0x${string}`;

	function deriveForAddress(address: `0x${string}`) {
		return initKeyFromHD(hdkey.derive(pathFromAddress(address)));
	}

	return {
		address,
		privateKey,
		publicKey,
		publicExtendedKey,
		deriveForAddress,
	};
}

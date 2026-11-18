import {bls12_381} from '@noble/curves/bls12-381';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
import type {HttpChainClient} from 'tlock-js';

/**
 * An offline drand network for tests (the same construction as packages/client/test/utils/fake-drand.ts):
 * a BLS key made up here, on the unchained scheme tlock-js supports (`pedersen-bls-unchained`).
 * A round's beacon is the signature of sha256(round as 8 bytes big-endian).
 *
 * Unlike the client's, it refuses a round whose time has not come (by `Date.now()`, which a test may
 * fake), like the real network, which has not produced that beacon yet.
 */
export function createFakeDrand(): HttpChainClient & {roundTime(round: number): number; roundAt(time: number): number} {
	const secretKey = bls12_381.utils.randomPrivateKey();
	const period = 3;
	const genesis = Math.floor(Date.now() / 1000) - 3 * 1000;
	const info = {
		public_key: bytesToHex(bls12_381.getPublicKey(secretKey)),
		period,
		genesis_time: genesis,
		hash: '00'.repeat(32),
		groupHash: '00'.repeat(32),
		schemeID: 'pedersen-bls-unchained',
		metadata: {beaconID: 'fuzd-server-test'},
	};
	function roundId(round: number): Uint8Array {
		const bytes = new Uint8Array(8);
		new DataView(bytes.buffer).setBigUint64(0, BigInt(round));
		return sha256(bytes);
	}
	const roundTime = (round: number) => genesis + (round - 1) * period;
	const client = {
		options: {disableBeaconVerification: true, noCache: true, chainVerificationParams: undefined},
		chain: () => ({baseUrl: 'fake-drand', info: async () => info}),
		async get(round: number) {
			if (roundTime(round) > Date.now() / 1000) {
				throw new Error(`fake drand: round ${round} is in the future`);
			}
			return {round, signature: bytesToHex(bls12_381.sign(roundId(round), secretKey))};
		},
		async latest() {
			throw new Error('fake drand: latest() is not served');
		},
		roundTime,
		roundAt: (time: number) => Math.floor((time - genesis) / period) + 1,
	};
	return client as unknown as HttpChainClient & {roundTime(round: number): number; roundAt(time: number): number};
}

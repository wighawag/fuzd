import {describe, expect, it, vi} from 'vitest';
import {safeEqual} from '../src/utils/safe-equal.js';

// The admin password and the internal token are compared in constant time: `===` stops at the
// first differing character, so the time it takes tells an attacker how much of a guess is right.
// Both sides are hashed first (SHA-256, crypto.subtle: on Workers and on node), and the digests,
// always 32 bytes, compared byte by byte without stopping, which also hides the length.

describe('safeEqual', () => {
	it('tells equal strings from different ones', async () => {
		expect(await safeEqual('secret', 'secret')).toBe(true);
		expect(await safeEqual('', '')).toBe(true);
		expect(await safeEqual('secret', 'secreT')).toBe(false);
		expect(await safeEqual('secret', 'secret ')).toBe(false);
		expect(await safeEqual('secret', '')).toBe(false);
		expect(await safeEqual('é', 'e\u0301')).toBe(false);
	});

	it('hashes both sides, so the comparison is over digests of one length', async () => {
		const digest = vi.spyOn(crypto.subtle, 'digest');
		try {
			await safeEqual('a', 'a much longer guess');
			expect(digest).toHaveBeenCalledTimes(2);
			expect(digest.mock.calls.map((v) => v[0])).toEqual(['SHA-256', 'SHA-256']);
		} finally {
			digest.mockRestore();
		}
	});
});

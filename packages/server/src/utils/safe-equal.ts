const encoder = new TextEncoder();

/**
 * Compare two secrets (a password, a token) in constant time. `===` stops at the first differing
 * character, so its duration tells how much of a guess is right. Both sides are hashed with SHA-256
 * first (crypto.subtle, on Workers and on node), and the digests, always 32 bytes, are compared byte
 * by byte without stopping early, which also hides a difference in length.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
	const [digestA, digestB] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b)),
	]);
	const bytesA = new Uint8Array(digestA);
	const bytesB = new Uint8Array(digestB);
	let difference = 0;
	for (let i = 0; i < bytesA.length; i++) {
		difference |= bytesA[i] ^ bytesB[i];
	}
	return difference === 0;
}

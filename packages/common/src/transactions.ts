/**
 * Whether two transactions are the same, as fuzd stores them (JSON): whatever the key order, the case
 * of hex strings, and fields left undefined. Tells a retry of an execution from another execution
 * that used its slot.
 */
export function sameTransaction(a: unknown, b: unknown): boolean {
	const canonical = (value: unknown): unknown => {
		if (typeof value === 'string') {
			return value.toLowerCase();
		}
		if (Array.isArray(value)) {
			return value.map(canonical);
		}
		if (value && typeof value === 'object') {
			return Object.fromEntries(
				Object.keys(value)
					.filter((key) => (value as Record<string, unknown>)[key] !== undefined)
					.sort()
					.map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
			);
		}
		return value;
	};
	return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

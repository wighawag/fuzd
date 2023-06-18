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

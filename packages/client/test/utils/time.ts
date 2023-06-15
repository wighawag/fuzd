export function initTime() {
	let offset = 0;
	return {
		async getTimestamp() {
			return Math.floor(Date.now() / 1000) + offset;
		},
		increaseTime(delta: number) {
			offset += delta;
		},
	};
}

export function initTime() {
	return {
		async getTimestamp() {
			return Math.floor(Date.now() / 1000);
		},
	};
}

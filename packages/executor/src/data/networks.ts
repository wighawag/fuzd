// NEVER CHANGES THESE VALUES UNLESS YOU CAN RESET SAFELY THE DEBTS
export const networks: Record<string, {debtUnit: bigint}> = {
	'1': {
		debtUnit: 1_000_000_000n,
	},
	'100': {
		debtUnit: 1n, // TODO
	},
	'11155111': {
		debtUnit: 1_000_000n,
	},
	'31337': {
		debtUnit: 1_000_000_000n,
	},
};

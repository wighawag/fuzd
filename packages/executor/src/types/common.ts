export type Time = {
	getTimestamp(): Promise<number>;
};

export type SingleFeeStrategy = {
	type: 'single';
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
};

export type FeeStrategy = SingleFeeStrategy;

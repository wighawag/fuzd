import {
	EIP1193BlockNumberProvider,
	EIP1193CallProvider,
	EIP1193GetBlockByHashProvider,
	EIP1193GetBlockByNumberProvider,
} from 'eip-1193';

export type Time = {
	getTimestamp(
		provider: EIP1193CallProvider &
			EIP1193GetBlockByNumberProvider &
			EIP1193BlockNumberProvider &
			EIP1193GetBlockByHashProvider,
	): Promise<number>;
};

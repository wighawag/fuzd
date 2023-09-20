import type {EIP1193CallProvider, EIP1193Account} from 'eip-1193';

export async function getTimeFromContractTimestamp(
	provider: EIP1193CallProvider,
	contract: EIP1193Account,
): Promise<number> {
	const result = await provider.request({
		method: 'eth_call',
		params: [
			{
				to: contract,
				data: '0xb80777ea', // timestamp()
			},
		],
	});
	const value = parseInt(result.slice(2), 16);
	return value;
}

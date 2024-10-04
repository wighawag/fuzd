import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {getChain} from 'rocketh';
import {Abi, createPublicClient, createWalletClient, custom, getContract} from 'viem';

export async function createViemContext(provider: EIP1193ProviderWithoutEvents) {
	const chainId = await provider.request({method: 'eth_chainId'});
	const chain = getChain(Number(chainId).toString());
	const walletClient = createWalletClient({
		chain,
		transport: custom(provider),
	});

	const publicClient = createPublicClient({
		chain,
		transport: custom(provider),
	});

	function getAccounts() {
		return walletClient.getAddresses();
	}

	function contract<TAbi extends Abi>(contractInfo: {address: `0x${string}`; abi: TAbi}) {
		return getContract({
			...contractInfo,
			client: {
				wallet: walletClient,
				public: publicClient,
			},
		});
	}

	return {
		walletClient,
		publicClient,
		client: {
			wallet: walletClient,
			public: publicClient,
		},
		getAccounts,
		contract,
	};
}

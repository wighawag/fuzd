import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {Abi, createPublicClient, createWalletClient, custom, getContract} from 'viem';
import {hardhat} from 'viem/chains';

export function createViemContext(provider: EIP1193ProviderWithoutEvents) {
	const walletClient = createWalletClient({
		chain: hardhat,
		transport: custom(provider),
	});

	const publicClient = createPublicClient({
		chain: hardhat,
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

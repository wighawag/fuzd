export const poolId =
	Number(process.env.VITEST_POOL_ID ?? 1) * Number(process.env.VITEST_SHARD_ID ?? 1) +
	(process.env.VITE_NETWORK_TRANSPORT_MODE === 'webSocket' ? 100 : 0);

export const FUZD_URL = `http://localhost:8787/${poolId}`;

export const ANVIL_URL = `http://localhost:8546/${poolId}`;

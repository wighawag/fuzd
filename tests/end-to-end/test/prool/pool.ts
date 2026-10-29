export const poolId =
	Number(process.env.VITEST_POOL_ID ?? 1) * Number(process.env.VITEST_SHARD_ID ?? 1) +
	(process.env.VITE_NETWORK_TRANSPORT_MODE === 'webSocket' ? 100 : 0);

/**
 * The ports the anvil and fuzd proxies listen on: E2E_ANVIL_PORT and E2E_FUZD_PORT when set,
 * otherwise free ports the globalSetup picks and passes to the test workers through the env.
 * Nothing here is a fixed port, so the suite runs beside whatever else this machine listens on.
 */
function port(name: 'E2E_ANVIL_PORT' | 'E2E_FUZD_PORT'): number {
	const value = parseInt(process.env[name] || '');
	if (isNaN(value)) {
		throw new Error(`${name} is not set: the globalSetup picks it, or set it to a free port`);
	}
	return value;
}

export const FUZD_URL = `http://localhost:${port('E2E_FUZD_PORT')}/${poolId}`;

export const ANVIL_URL = `http://localhost:${port('E2E_ANVIL_PORT')}/${poolId}`;

/** The admin token the fuzd instances are started with (`--admin-token`), for setChainOverride. */
export const ADMIN_TOKEN = 'e2e-admin-token';
export const ADMIN_HEADERS = {Authorization: `Basic ${btoa(`admin:${ADMIN_TOKEN}`)}`};

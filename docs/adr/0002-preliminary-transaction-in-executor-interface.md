# Preliminary-transaction hook in the executor chain-protocol interface

The `ExecutorChainProtocol` interface exposes an optional `requiredPreliminaryTransaction(...)` hook. This exists to support Starknet, where an account may require a preliminary transaction (e.g. deployment/activation) before it is operational and can broadcast. EVM chains do not need this, so the hook is optional; making it part of the shared chain-protocol abstraction lets Starknet be supported without special-casing it outside the interface.

## Consequences

- The abstraction carries a Starknet-shaped concept (preliminary tx) that is a no-op for EVM; this is deliberate so new chains with similar activation requirements fit the same seam.

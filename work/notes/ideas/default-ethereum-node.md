---
title: Support a DEFAULT_ETHEREUM_NODE fallback for chain config
slug: default-ethereum-node
---

## Idea

When assigning chain protocols from env, fall back to a default Ethereum node when a `CHAIN_<id>` override is not provided, instead of requiring every chain to be configured explicitly.

Sketch from the existing code comment (`packages/server/src/setup.ts`, `assignChainProtocols`):

- Treat Ethereum as the default provider (e.g. an Alchemy-style URI template `https://{chainName}.g.alchemy.com/v2/<api-key>#finality=12&worstCaseBlockTime=15`).
- Before accepting, make a request to check the node actually works; if not, reject the request. At minimum enforce this for writable requests.

## Why it's an idea (not a task yet)

Open scope: which default, how to key the api-key, whether the liveness check runs per-request or once at setup, and whether it applies to all requests or only writable ones. Needs a decision on those before it is buildable. Source: `TODO.md` (now captured here) + the `// TODO use DEFAULT_ETHEREUM_NODE?` comment in `packages/server/src/setup.ts`.

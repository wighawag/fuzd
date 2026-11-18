---
title: Derive the server account once per mnemonic, not on every request
slug: cache-server-account
blockedBy: []
covers: []
---

Built directly on request. `setup` (`packages/server/src/setup.ts`) runs on every request and derived the server account from `HD_MNEMONIC` each time: `mnemonicToSeedSync` (PBKDF2, 2048 rounds) then the HD path, about 7 ms of CPU on node per request, and most of an idle processing loop's 0.1 to 1 s of CPU per alarm on Cloudflare (`work/notes/findings/cloudflare-worker-cron-capacity.md`).

## What was built

- A module-level `Map` from mnemonic to derived account, filled lazily inside a request (`getServerAccount`).
- The default drand client (`mainnetClient()`) is made once, lazily, too: it caches the chain info it fetches, so a client per request fetched it again before the first decryption of every run.
- Test `packages/server/test/setup-cache.test.ts`: two requests derive once (a spy on `@scure/bip39`'s `mnemonicToSeedSync` through `vi.mock`; red before: 3 derivations for setup plus two requests), and two servers with different mnemonics answer different remote accounts, the first one still its own afterwards.

## Acceptance criteria

- [x] Two requests derive the account once.
- [x] A different mnemonic gives a different account, and the cache stays correct across mnemonics.
- [x] Nothing computed at global scope (the existing "creates the server without generating random values" test still passes).
- [x] Changeset (`@fuzd/server`: patch).

## Decisions

- **Keyed by the mnemonic itself**, not "derive once": a changed `HD_MNEMONIC` (a new secret on a long-lived isolate, another server instance in the same process) derives its own account.
- **Chain protocols stay per request.** Building them is cheap (measured: well under a microsecond each, `createCurriedJSONRPC` only), and building them from the env and `chainOverrides` each time is what keeps `setChainOverride` taking effect at once. Caching them would mean invalidating on env and override changes for no measurable gain.
- **A drand client given through `ServerOptions.getDrandClient` is used as given**: what it caches is the caller's choice.

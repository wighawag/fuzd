# CONTEXT — fuzd domain language

The domain glossary for `fuzd`. Agents and skills use THIS vocabulary when naming modules, tests, and discussing the system. Architectural rationale lives in `docs/adr/` (decisions); product framing lives in `work/specs/`.

## What fuzd is

fuzd lets users schedule and execute transactions in the future without the server learning their content until execution time. Transactions stay encrypted (via Drand timelock) until their scheduled moment, and the system is modular: pluggable execution engines and decryption systems across chains (currently EVM and Starknet).

## Core domain terms

- **Blindfolded execution** — the core promise: a delegated executor runs a user's transaction at a future time without being able to read its content beforehand.
- **Trust model** — users do NOT trust the fuzd host with their payload; they trust the Drand nodes for the timelock. The worst a host can do is not execute, or delay; it can never read or alter content ahead of time (`docs/adr/0001-trust-model-drand-not-host.md`).
- **Preliminary transaction** — an optional executor hook (`requiredPreliminaryTransaction`) for chains (Starknet) whose accounts need an activation/setup tx before they can broadcast (`docs/adr/0002-preliminary-transaction-in-executor-interface.md`).
- **Scheduler** (`fuzd-scheduler`) — performs the delayed execution, decrypts the payload when the time is reached, then defers the actual send to an execution API.
- **Executor** (`fuzd-executor`) — the execution API that submits transactions on behalf of an account using a simple execution mechanism.
- **tlock-decrypter** (`fuzd-tlock-decrypter`) — accepts Drand-encrypted payloads and decrypts them into transactions once the timelock round is reachable.
- **chain-protocol** (`fuzd-chain-protocol`) — abstraction layer letting fuzd support any network (any Ethereum-RPC-spec EVM chain, plus Starknet).
- **client** (`fuzd-client`) — client library plus a CLI to schedule execution from the command line.
- **server** (`fuzd-server`) — a Hono-based API server wiring scheduler + executor together; deployable e.g. as `fuzd-cf-worker` (Cloudflare Worker + D1).
- **Drand / timelock** — the external randomness/timelock beacon (drand.love) used to keep payloads encrypted until a future round.
- **Reveal transaction** — the decrypted transaction that becomes available at execution time (see the scheduling flow, where a reveal tx is constructed and submitted).
- **Derivation parameters** — parameters (e.g. `publicKey`, optional `accountContractClassHash`) submitted at scheduling time alongside `chainId`.
- **promptGuidance** — the per-repo NUDGE namespace in `dorfl.json` whose members (currently just `testFirst`) strengthen the wording in the worker's in-band prompt. NOT a gate: the `verify` step is still the only acceptance bar. Omitted ⇒ off; absence is the default.
- **work/ contract** — the on-disk system this repo uses, defined by the reference docs in **`work/protocol/`** (copied here by `setup`): `WORK-CONTRACT.md` (the contract), `CLAIM-PROTOCOL.md`, `REVIEW-PROTOCOL.md`, `task-template.md`, `spec-template.md`, `ADR-FORMAT.md`. Three REGIME umbrellas — `notes/` (capture buckets), `tasks/` (the build board), `specs/` (the spec lifecycle) — plus top-level `questions/` and `protocol/`. One markdown file per item, status = the folder it lives in (never a field). Capture buckets: `notes/ideas/` (proposed), `notes/observations/` (spotted, unverified, append-only), `notes/findings/` (verified external/domain ground truth, each with a `source:`). ADRs (`docs/adr/`, format in `work/protocol/ADR-FORMAT.md`) record what WE decided and why.

## Conventions

Standing per-change rules agents must follow in this repo.

- Every user-facing change needs a **changeset** (`pnpm changeset`) — this repo publishes its packages via Changesets (`.changeset/`).

## Skills this repo uses

- Required: `setup` (onboarding/migration), `to-spec`, `to-task`.
- Recommended: `review`, `grill-me`.

---
title: Shard fuzd by user address, when one database's processing is not enough
slug: shard-users-by-address
---

## Idea

Split one fuzd deployment into N independent shards, each with its own database and its own processing, and send every user to one shard picked from their address. A proposal, not a plan to build now: `docs/adr/0004-claim-due-items-with-a-lease.md` (several processing runs on one database) comes first, and sharding is only worth it once that is not enough.

## Why it fits fuzd

- **Every per-user record is keyed by the user's address.** `ScheduledExecutions` and `BroadcastedExecutions` have `(account, chainId, slot[, batchIndex])` as primary key, where `account` is the signer the `auth` middleware recovers. Nothing a user schedules reads another user's rows.
- **The remote account (the broadcaster) is derived from the shared HD mnemonic plus the user's address** (`chainProtocol.getBroadcaster(serverAccount, derivationParameters, account)`, i.e. `deriveForAddress(account)`). Shards that share `HD_MNEMONIC` derive the same remote account for a user, and publish the same `derivationParameters` (the xpub), so a client may ask any shard for its remote account and get the same answer, and a user's funds do not depend on which shard they land on.
- That is also the constraint: **routing must be deterministic**, `shard = hash(address) mod N`. If two shards could receive the same user, both would send from the same remote account, each with its own `Broadcasters` row (nonce, lock, debt), and they would collide on its nonce: replaced transactions, a reveal lost.

## Shape

- **Route in the game client, not through a router.** The client knows the player's address before it signs anything, and can pick `endpoints[shard(address)]` from a list it is configured with. No extra hop in front of fuzd, no router to scale or keep alive, no single point of failure added. A router (a Worker that hashes the signer and forwards) remains possible for clients that cannot be changed, but it has to recover the signer from the signature to route a `POST`, which costs a signature recovery per request.
- **Many logical shards, fewer machines.** Hash into a fixed, large number of logical shards (for example 64) and map logical shards onto databases or machines with a table (`logical shard -> endpoint`). Scaling moves whole logical shards (copy their rows, switch the table entry), and N never changes: changing N would move almost every user, and moving a user with pending work is exactly the nonce collision above.
- **The one cross-user state is the payment account.** `PAYMENT_ACCOUNT`'s remote account pays for gas above what an execution authorised, for any user, and its nonce lives in one database. Shards sharing it would collide on its nonce, so each shard needs its own payment account (and its own funding and balance alert). Fees and expected gas prices (`ChainConfigurations`) are per database too: an operator update must reach every shard, or `validateParameters` accepts different service parameters on different shards.
- **On Cloudflare: one D1 database per logical shard, inside one Worker.** D1 is built for many small databases (100,000 included on Workers Paid, one query at a time each, `developers.cloudflare.com/d1/platform/limits`). The Worker picks the binding (or, past the binding limit, a database id) from the request's shard; each shard's processing loops (ADR 0004) run on that shard's database only. One deployment, one secret set, N databases.
- **Availability: a dead shard fails all its players.** Nothing else serves their remote accounts. Each shard therefore needs a standby that takes over its database (same mnemonic, same database), one active at a time. Several processors on one shard's database are safe (claims, ADR 0004); a logical shard served from two databases (a standby with its own copy, both accepting work) is the nonce collision above. On Cloudflare the platform provides most of this (D1 and Workers are not a single machine); on nodejs it is a real process-supervision question.

## When it would be needed

Only once one shard's processing, after ADR 0004, is not enough. Measured on Cloudflare staging (`work/notes/findings/cloudflare-worker-cron-capacity.md`): a pool of Durable Object loops on one D1 database broadcasts several hundred reveals per minute and grows with the number of loops; one D1 database processes queries one at a time, so the wall is the database (about 9 statements per execution) or the RPC provider's rate limit, well before the Worker. Sharding is the answer to those two (each shard can also use its own RPC key), not to CPU.

## Open questions

- The hash: which function, over which form of the address (lowercase hex, as stored: `docs/adr/0003`), and how the game client and fuzd share the `logical shard -> endpoint` table (static config, or a signed list fuzd publishes).
- Moving a logical shard: copying its rows while executions are due, and the cut-over (stop processing on the source, copy, switch, start), without a window where both process it.
- Users that act for others (`onBehalf`, `paymentReserve.broadcaster`): routing is by the signer, so is any query by `onBehalf` (`getAccountSubmissions`, the dashboard) now a fan-out over every shard?
- Admin and dashboard across shards: a fan-out view, or one per shard.
- The payment account per shard: who funds N of them, and does a shard whose payment account is empty degrade only its own players during a gas spike.
- Standby on nodejs: what guarantees one active processor per shard (a lease in the database itself, like ADR 0004's, but per shard).
- Whether 64 logical shards is the right count (it caps how many databases or machines the deployment can ever spread over).

---
title: Client scheduling flow sketch (remote account -> reveal tx -> submit)
slug: scheduling-flow-sketch
---

## Idea

A sketch of the intended client-side flow for scheduling a blindfolded execution. Captured from `NOTES.md`; represents an intended flow, not yet a settled/documented contract.

1. Fetch `getRemoteAccount`.
2. Fetch the balance.
3. Perform a tx to add to the balance (can be part of a commit in a commit-reveal scheme).
4. Construct the tx data (the reveal tx).
5. Submit the scheduling, including `chainId` and derivation parameters: `(publicKey, [accountContractClassHash])`.

## Why it's an idea (not settled docs)

This is a design sketch of our own intended flow. Once ratified it could graduate into `CONTEXT.md` / a guide page (or a spec if it needs building out), but as captured it is an unverified intended flow. Source: `NOTES.md` (now captured here).

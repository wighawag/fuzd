---
title: admin/paymentAccountBroadcaster returns the derived private key
slug: admin-payment-account-broadcaster-returns-private-key
---

Spotted while adding validation to `packages/server/src/api/admin/index.ts` (not verified against intent): `GET /admin/paymentAccountBroadcaster` returns `config.account.deriveForAddress(config.paymentAccount)`, which is a whole `ETHAccount` including `privateKey`. It is behind the admin basic auth, so it may be deliberate (operator tooling), but it puts a hot key in an HTTP response and logs. Worth a decision: return only `address`, or keep it and say why.

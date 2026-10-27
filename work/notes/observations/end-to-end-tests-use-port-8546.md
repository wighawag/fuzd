---
title: tests/end-to-end hardcodes anvil on port 8546 and fuzd on 8787
slug: end-to-end-tests-use-port-8546
---

`tests/end-to-end/test/prool/pool.ts` fixes `ANVIL_URL` to `http://localhost:8546/<poolId>` and `FUZD_URL` to `http://localhost:8787/<poolId>`. On the developer machine 8546 belongs to another project, so the suite cannot run there without stopping it; it was therefore not run while building `feat/zod-validation`. A free/configurable port (e.g. from env, or picked at globalSetup) would let it run anywhere.

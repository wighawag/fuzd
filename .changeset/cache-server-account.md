---
'@fuzd/server': patch
---

The server account is derived from `HD_MNEMONIC` once per mnemonic, per process or Worker isolate, instead of on every request (PBKDF2 with 2048 rounds, then the HD derivation: about 7 ms of CPU on node, more on a Worker, for every API request and every processing run). The default drand client is also made once, so the chain info it caches is fetched once rather than on every run. Both are made lazily, in a request, never at global scope. On the Cloudflare Worker (`platforms/cf-worker`) this is most of the CPU of an idle processing loop's alarm.

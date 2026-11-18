---
'@fuzd/client': patch
---

When the server refuses a remote account or reserved-amount request, the client's error now carries the server's messages. It threw `failed: <url>` for the remote account (it read a field the server never sends, `error`), and `[object Object]` for the reserved amount (it passed the `errors` array to `Error`).

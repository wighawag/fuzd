---
'@fuzd/client': minor
---

The failure that `scheduleExecution` and `broadcastExecution` return is typed as the server's body, `FailureResponse` (`{success: false, errors: [{message, name?, code?, status?}]}`, now exported), instead of `{success: false, error}`: over HTTP the client returns the server's body unchanged, and it never had an `error` field. `broadcastExecution` with a function `schedulerEndPoint` returns that shape too (`errors: [{message}]`) instead of `{success: false, error}`.

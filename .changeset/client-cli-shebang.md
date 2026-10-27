---
'@fuzd/client': patch
---

The `fuzd-client` command runs when installed from npm: its entry file now starts with `#!/usr/bin/env node`, so the shell no longer tries to execute it as a shell script.

// Setup files run outside isolated storage, and may be run multiple times.
// `applyD1Migrations()` only applies migrations that haven't already been

import {applyD1Migrations, env} from 'cloudflare:test';

// applied, therefore it is safe to call this function here.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

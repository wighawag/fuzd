import path from 'node:path';
import {defineWorkersConfig, readD1Migrations} from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
	// Read all migrations in the `migrations` directory
	const migrationsPath = path.join(__dirname, '../../packages/server/src/schema/sql');
	const migrations = await readD1Migrations(migrationsPath);
	return {
		test: {
			setupFiles: ['./test/vitest/apply-migrations.ts'],
			poolOptions: {
				workers: {
					// singleWorker: true,
					wrangler: {
						configPath: './wrangler.toml',
						environment: 'production',
					},
					miniflare: {
						// Add a test-only binding for migrations, so we can apply them in a
						// setup file
						bindings: {TEST_MIGRATIONS: migrations},
					},
				},
			},
		},
	};
});

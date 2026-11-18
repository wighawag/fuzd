import fs from 'node:fs';
import path from 'node:path';
import {defineWorkersConfig, readD1Migrations} from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
	// Read all migrations in the `migrations` directory
	const migrationsPath = path.join(__dirname, '../../packages/server/src/schema/sql');
	const migrations = await readD1Migrations(migrationsPath);
	// @fuzd/server is bundled by Vite (below) and is a workspace package: its build changes without
	// the lockfile changing, which is all Vite checks before reusing a bundle, and vitest drops
	// `optimizeDeps.force`. So the bundle is made again on every run.
	fs.rmSync(path.join(__dirname, 'node_modules/.vite/vitest/deps_ssr'), {recursive: true, force: true});
	// The pool loads the secrets of a .dev.vars (or .env) beside the wrangler config: a developer's
	// own, which would leak into the tests (a CHAIN_<id> pointing at their node, DEV, ...). The tests
	// use a copy of wrangler.toml in a directory of their own instead, with `main` made absolute.
	const testConfigDir = path.join(__dirname, 'node_modules/.cache/vitest-wrangler');
	fs.mkdirSync(testConfigDir, {recursive: true});
	const wranglerToml = fs.readFileSync(path.join(__dirname, 'wrangler.toml'), 'utf8');
	const testWranglerToml = wranglerToml.replace(
		/^main = "(.*)"$/m,
		(_, main) => `main = ${JSON.stringify(path.join(__dirname, main))}`,
	);
	if (testWranglerToml === wranglerToml) {
		throw new Error('wrangler.toml: no main = "..." line to rewrite');
	}
	const testConfigPath = path.join(testConfigDir, 'wrangler.toml');
	fs.writeFileSync(testConfigPath, testWranglerToml);
	process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
	return {
		test: {
			include: ['test/**/*.test.ts'],
			exclude: ['test/**/*.node.test.ts'],
			// @fuzd/server is bundled by Vite first: served module by module, its generated
			// `schema/ts/*.sql.js` match wrangler's default `**/*.sql` Text rule in the pool, and workerd
			// then fails to load them
			deps: {optimizer: {ssr: {enabled: true, include: ['@fuzd/server']}}},
			setupFiles: ['./test/vitest/apply-migrations.ts'],
			poolOptions: {
				workers: {
					// singleWorker: true,
					wrangler: {
						configPath: testConfigPath,
						environment: 'production',
					},
					miniflare: {
						// a test-only binding for the migrations, applied in a setup file, and the test's secrets
						bindings: {
							TEST_MIGRATIONS: migrations,
							HD_MNEMONIC: 'test test test test test test test test test test test junk',
							TOKEN_ADMIN: 'test-admin-token',
						},
					},
				},
			},
		},
	};
});

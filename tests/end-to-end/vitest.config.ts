import {join} from 'node:path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		setupFiles: [join(__dirname, './test/prool/setup.ts')],
		globalSetup: [join(__dirname, './test/prool/globalSetup.ts')],
		hookTimeout: 6_000,
		testTimeout: 6_000,
	},
});

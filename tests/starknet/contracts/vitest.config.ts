import {join} from 'node:path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		setupFiles: [join(__dirname, './prool/setup.ts')],
		globalSetup: [join(__dirname, './prool/globalSetup.ts')],
		hookTimeout: 60_000,
		testTimeout: 60_000,
	},
});

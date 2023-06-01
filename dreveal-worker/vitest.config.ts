import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'miniflare',
		environmentOptions: {
			modules: true,
			scriptPath: './dist/index.js',
			durableObjects: {
				EXECUTOR: 'ExecutorDO',
			},
		},
	},
});

import {defineConfig} from 'vitest/config';

// tests of plain modules (no Workers runtime needed), run in node: `pnpm test:node`
export default defineConfig({
	test: {
		include: ['test/**/*.node.test.ts'],
		environment: 'node',
	},
});

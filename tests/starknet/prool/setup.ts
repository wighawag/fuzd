import {afterAll} from 'vitest';
import {resetKatana} from './index.js';

afterAll(async () => {
	if (process.env.SKIP_GLOBAL_SETUP) return;
	await resetKatana();
});

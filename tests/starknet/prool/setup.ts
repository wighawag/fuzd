import {afterAll} from 'vitest';
import {resetKatana} from '.';

afterAll(async () => {
	if (process.env.SKIP_GLOBAL_SETUP) return;
	await resetKatana();
});

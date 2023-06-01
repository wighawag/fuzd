import {expect, test} from 'vitest';
import {router} from '../src/index';

test('responds with url', async () => {
	const req = new Request('http://localhost/');
	const res = await router.handle(req);
	expect(await res.text()).toBe('URL: http://localhost/ KEY: value');
});

import {describe, it, expect} from 'vitest';
import {env, createExecutionContext, createScheduledController, waitOnExecutionContext} from 'cloudflare:test';
import worker from '../src/worker';
import {setupWorker} from './utils';

// A smoke test of the Worker in the Workers runtime (workerd, through @cloudflare/vitest-pool-workers):
// it starts, answers, reaches its D1 database and runs a cron. Nothing here needs a chain: the RPC
// paths are covered by the in-process server tests (packages/server/test).

const worker_ = setupWorker();
const admin = {Authorization: `Basic ${btoa(`admin:${env.TOKEN_ADMIN}`)}`};

describe('the fuzd worker', () => {
	it('answers with its version', async () => {
		const response = await worker_.fetch('/');
		expect(response.status).toBe(200);
		expect(await response.text()).toMatch(/^fuzd api : \d+\.\d+\.\d+/);
	});

	it('sets up its D1 database, for the admin only', async () => {
		expect((await worker_.fetch('/admin/setup')).status).toBe(401);
		const response = await worker_.fetch('/admin/setup', {headers: admin});
		expect(await response.json()).toEqual({success: true});
	});

	it('refuses the internal routes without credentials', async () => {
		expect((await worker_.fetch('/internal/checkScheduledExecutionStatus')).status).toBe(401);
	});

	it('runs a cron', async () => {
		await worker_.fetch('/admin/setup', {headers: admin});
		const controller = createScheduledController({scheduledTime: new Date(), cron: '*/2 * * * *'});
		const ctx = createExecutionContext();
		const response: any = await worker.scheduled(controller, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({success: true, result: {executions: []}});
	});
});

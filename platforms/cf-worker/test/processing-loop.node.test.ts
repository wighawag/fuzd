import 'named-logs-context';
import {describe, expect, it} from 'vitest';
import {createProcessingLoopClass, processingLoopSettings} from '../src/processing-loop.js';
import type {Env} from '../src/env.js';

// The Durable Object loop of src/processing-loop.ts, on a fake state: its alarm must run the actions,
// fire again at once while a run stopped on its budget, after the idle pause otherwise, keep a next
// alarm even when the work fails, and stop for good when the pool is made smaller.

function fakeState() {
	const values = new Map<string, unknown>();
	const alarms: number[] = [];
	let alarm: number | null = null;
	const state = {
		storage: {
			async get<T>(key: string) {
				return values.get(key) as T | undefined;
			},
			async put(key: string, value: unknown) {
				values.set(key, value);
			},
			async getAlarm() {
				return alarm;
			},
			async setAlarm(time: number) {
				alarm = time;
				alarms.push(time);
			},
		},
		waitUntil(_promise: Promise<unknown>) {},
	};
	return {state, alarms, clearAlarm: () => (alarm = null)};
}

function fakeApp(answers: Record<string, unknown>) {
	const calls: string[] = [];
	return {
		calls,
		app: {
			internalRequest: (action: string) => new Request(`http://localhost/internal/${action}`),
			async fetch(request: Request) {
				const action = new URL(request.url).pathname.split('/').pop()!;
				calls.push(action);
				const answer = answers[action];
				if (answer instanceof Error) throw answer;
				return new Response(JSON.stringify(answer ?? {success: true}), {status: 200});
			},
		},
	};
}

const env = (extra: Partial<Env> = {}) =>
	({PROCESSING_LOOP: {} as any, PROCESSING_LOOP_IDLE_MS: '5000', NAMED_LOGS: '-', ...extra}) as unknown as Env;

async function startedLoop(app: ReturnType<typeof fakeApp>['app'], e: Env, index = 0) {
	const ProcessingLoop = createProcessingLoopClass(() => app as any);
	const {state, alarms, clearAlarm} = fakeState();
	const loop = new ProcessingLoop(state as any, e);
	await loop.fetch(new Request(`https://processing-loop/start?index=${index}`));
	return {loop, alarms, clearAlarm};
}

describe('processingLoopSettings', () => {
	it('defaults to one loop and 5s, and to none without the binding or with the crons disabled', () => {
		expect(processingLoopSettings(env())).toEqual({count: 1, idleMs: 5000});
		expect(processingLoopSettings(env({PROCESSING_LOOPS: '4', PROCESSING_LOOP_IDLE_MS: '2000'}))).toEqual({
			count: 4,
			idleMs: 2000,
		});
		expect(processingLoopSettings(env({PROCESSING_LOOPS: '0'})).count).toBe(0);
		expect(processingLoopSettings(env({PROCESSING_LOOPS: 'nope'})).count).toBe(0);
		expect(processingLoopSettings(env({DISABLE_CRON: 'true'})).count).toBe(0);
		expect(processingLoopSettings({...env(), PROCESSING_LOOP: undefined}).count).toBe(0);
	});
});

describe('a processing loop', () => {
	it('starts on its first start request, and only sets an alarm when none is set', async () => {
		const {app} = fakeApp({});
		const {loop, alarms} = await startedLoop(app, env());
		expect(alarms).toHaveLength(1);
		await loop.fetch(new Request('https://processing-loop/start?index=0'));
		expect(alarms).toHaveLength(1);
	});

	it('runs both actions, then waits the idle pause when there is no more to do', async () => {
		const {app, calls} = fakeApp({processQueue: {success: true, result: {budgetExhausted: false}}});
		const {loop, alarms} = await startedLoop(app, env());
		const before = Date.now();
		await loop.alarm();
		expect(calls).toEqual(['processQueue', 'processTransactions']);
		const next = alarms[alarms.length - 1];
		expect(next).toBeGreaterThanOrEqual(before + 5000);
	});

	it('fires again at once when a run stopped on its budget', async () => {
		const {app} = fakeApp({processTransactions: {success: true, budgetExhausted: true}});
		const {loop, alarms} = await startedLoop(app, env());
		await loop.alarm();
		const next = alarms[alarms.length - 1];
		expect(next).toBeLessThanOrEqual(Date.now());
		// the idle alarm was set first, before the work
		expect(alarms[alarms.length - 2]).toBeGreaterThan(next);
	});

	it('keeps a next alarm when the actions fail', async () => {
		const {app, calls} = fakeApp({processQueue: new Error('rpc down'), processTransactions: new Error('rpc down')});
		const {loop, alarms} = await startedLoop(app, env());
		const count = alarms.length;
		await loop.alarm();
		expect(calls).toEqual(['processQueue', 'processTransactions']);
		expect(alarms.length).toBe(count + 1);
	});

	it('stops (sets no next alarm) once its index is beyond the pool', async () => {
		const {app, calls} = fakeApp({});
		const {loop, alarms, clearAlarm} = await startedLoop(app, env({PROCESSING_LOOPS: '2'}), 3);
		clearAlarm(); // the platform clears the alarm as it fires
		const count = alarms.length;
		await loop.alarm();
		expect(calls).toEqual([]);
		expect(alarms.length).toBe(count);
	});
});

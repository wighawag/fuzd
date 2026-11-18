#!/usr/bin/env node
/**
 * Reveal-burst load test for fuzd.
 *
 * Reproduces the game's pattern: during the commit phase every player schedules ONE execution,
 * all of them for the same instant (the start of the reveal window), and every one of them must be
 * broadcast before the window closes. Two phases, run separately so the second can be restarted:
 *
 *   schedule: N simulated players each get a remote account and schedule a time-locked execution
 *             for --reveal-at. Measures how the API copes with the submissions (latency, errors).
 *   watch:    polls fuzd until every execution is broadcast or the window closes. Measures how
 *             fast fuzd drains the burst and how many reveals would have been MISSED.
 *
 * Run with node >= 23 (it strips the types itself), see README.md for full scenarios.
 */
import {parseArgs} from 'node:util';
import fs from 'node:fs';
import {createClient, mainnetClient} from '@fuzd/client';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';

type Entry = {
	index: number;
	signer: string;
	remoteAccount?: string;
	scheduled: boolean;
	error?: string;
	remoteAccountMs?: number;
	scheduleMs?: number;
	// filled by watch
	broadcastTime?: number; // chain timestamp recorded by the executor
	seenAt?: number; // wall clock (s) when watch first saw the broadcast
	hash?: string;
	finalStatus?: string;
};

type State = {
	fuzd: string;
	chainId: string;
	runId: string;
	slot: string;
	revealAt: number;
	windowSeconds: number;
	timeLocked: boolean;
	scheduleStartedAt: number;
	scheduleEndedAt?: number;
	entries: Entry[];
};

const {positionals, values: args} = parseArgs({
	allowPositionals: true,
	options: {
		fuzd: {type: 'string'},
		'chain-id': {type: 'string', default: '31337'},
		rpc: {type: 'string'},
		fund: {type: 'string', default: 'anvil'}, // anvil | none
		count: {type: 'string', default: '100'},
		concurrency: {type: 'string', default: '10'},
		spread: {type: 'string', default: '0'}, // seconds over which submissions are spread
		'reveal-at': {type: 'string', default: '+300'}, // +seconds | next-hour | unix timestamp
		window: {type: 'string', default: '3600'}, // reveal window length, also used as expiryDelta
		'no-expiry': {type: 'boolean', default: false},
		'in-clear': {type: 'boolean', default: false},
		'max-fee-gwei': {type: 'string', default: '100'},
		seed: {type: 'string'},
		state: {type: 'string', default: 'reveal-burst.state.json'},
		poll: {type: 'string', default: '10'}, // watch: seconds between polling rounds
		'poll-concurrency': {type: 'string', default: '10'},
	},
});

const command = positionals[0];

function int(name: string, value: string | undefined): number {
	const n = Number(value);
	if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got ${value}`);
	return n;
}

function now(): number {
	return Date.now() / 1000;
}

function parseRevealAt(value: string): number {
	const t = Math.floor(now());
	if (value === 'next-hour') return Math.ceil((t + 1) / 3600) * 3600;
	if (value.startsWith('+')) return t + int('reveal-at', value.slice(1));
	return int('reveal-at', value);
}

function percentiles(values: number[]): string {
	if (values.length === 0) return 'n/a';
	const sorted = [...values].sort((a, b) => a - b);
	const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
	const f = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
	return `p50=${f(at(50))} p90=${f(at(90))} p95=${f(at(95))} p99=${f(at(99))} max=${f(sorted[sorted.length - 1])}`;
}

/** Run `task` over `items` with at most `concurrency` in flight. */
async function pool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
	let next = 0;
	const workers = Array.from({length: Math.max(1, concurrency)}, async () => {
		while (next < items.length) {
			const item = items[next++];
			await task(item);
		}
	});
	await Promise.all(workers);
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortError(err: unknown): string {
	const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
	return (message || 'unknown').slice(0, 300);
}

async function rpc(url: string, method: string, params: unknown[]) {
	const response = await fetch(url, {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
	});
	const json = await response.json();
	if (json.error) throw new Error(`${method}: ${json.error.message}`);
	return json.result;
}

function saveState(path: string, state: State) {
	fs.writeFileSync(path, JSON.stringify(state, null, '\t'));
}

// ------------------------------------------------------------------------------------------------
// schedule
// ------------------------------------------------------------------------------------------------
async function schedule() {
	const fuzd = args.fuzd?.replace(/\/$/, '');
	if (!fuzd) throw new Error(`--fuzd <url> is required`);
	const chainId = args['chain-id'] as string;
	const count = int('count', args.count);
	const concurrency = int('concurrency', args.concurrency);
	const spread = int('spread', args.spread);
	const windowSeconds = int('window', args.window);
	const maxFeePerGasAuthorized = BigInt(int('max-fee-gwei', args['max-fee-gwei'])) * 1_000_000_000n;
	const timeLocked = !args['in-clear'];
	if (args.fund === 'anvil' && !args.rpc) {
		throw new Error(`--fund anvil needs --rpc <anvil url> (or pass --fund none)`);
	}

	const revealAt = parseRevealAt(args['reveal-at'] as string);
	const runId = Math.floor(now()).toString(36);
	const seed = args.seed || `fuzd-load-${runId}`;
	const slot = `load-${runId}`;

	const state: State = {
		fuzd,
		chainId,
		runId,
		slot,
		revealAt,
		windowSeconds,
		timeLocked,
		scheduleStartedAt: now(),
		entries: [],
	};

	console.log(
		`scheduling ${count} executions on ${fuzd} (chain ${chainId}), reveal at ${new Date(revealAt * 1000).toISOString()} ` +
			`(in ${Math.round(revealAt - now())}s), window ${windowSeconds}s, ${timeLocked ? 'time-locked' : 'in clear'}, ` +
			`concurrency ${concurrency}, spread ${spread}s`,
	);
	if (revealAt - now() < 60) {
		console.warn(`warning: the reveal is less than 60s away, submissions may land after it`);
	}

	const drand = mainnetClient();
	const players = Array.from({length: count}, (_, index) => {
		const privateKey = keccak256(toHex(`${seed}:${index}`));
		return {index, privateKey, signer: privateKeyToAccount(privateKey).address.toLowerCase()};
	});

	const start = Date.now();
	let done = 0;
	const progress = setInterval(() => {
		const elapsed = (Date.now() - start) / 1000;
		console.log(`  ${done}/${count} submitted (${(done / elapsed).toFixed(1)}/s)`);
	}, 5000);

	await pool(players, concurrency, async (player) => {
		if (spread > 0) {
			const startAt = start + (player.index / count) * spread * 1000;
			const wait = startAt - Date.now();
			if (wait > 0) await sleep(wait);
		}
		const entry: Entry = {index: player.index, signer: player.signer, scheduled: false};
		try {
			const client = createClient({privateKey: player.privateKey, schedulerEndPoint: fuzd, drand});
			let t = performance.now();
			const remoteAccount = await client.assignRemoteAccount(chainId);
			entry.remoteAccountMs = performance.now() - t;
			entry.remoteAccount = remoteAccount.address;
			if (args.fund === 'anvil') {
				await rpc(args.rpc as string, 'anvil_setBalance', [remoteAccount.address, '0x56bc75e2d63100000']);
			}
			t = performance.now();
			const result = await client.scheduleExecution({
				slot,
				chainId: chainId as `${number}`,
				maxFeePerGasAuthorized,
				timing: {
					type: 'fixed-time',
					scheduledTime: revealAt,
					expiryDelta: args['no-expiry'] ? undefined : windowSeconds,
				},
				// a plain transfer to itself: the cost of a reveal is in fuzd, not in the tx
				transaction: {to: remoteAccount.address as `0x${string}`, gas: 21000n},
				inClear: !timeLocked,
			});
			entry.scheduleMs = performance.now() - t;
			if (result.success) {
				entry.scheduled = true;
			} else {
				entry.error = shortError((result as any).error || (result as any).errors || result);
			}
		} catch (err) {
			entry.error = shortError(err);
		}
		state.entries.push(entry);
		done++;
	});
	clearInterval(progress);
	state.scheduleEndedAt = now();
	state.entries.sort((a, b) => a.index - b.index);
	saveState(args.state as string, state);

	const elapsed = state.scheduleEndedAt - state.scheduleStartedAt;
	const ok = state.entries.filter((e) => e.scheduled);
	const failed = state.entries.filter((e) => !e.scheduled);
	console.log(`\n== schedule report ==`);
	console.log(`scheduled ${ok.length}/${count} in ${elapsed.toFixed(1)}s (${(count / elapsed).toFixed(1)} players/s)`);
	console.log(`remoteAccount ms: ${percentiles(ok.map((e) => e.remoteAccountMs || 0))}`);
	console.log(`scheduleExecution ms: ${percentiles(ok.map((e) => e.scheduleMs || 0))}`);
	if (failed.length > 0) {
		const histogram = new Map<string, number>();
		for (const e of failed) {
			const key = (e.error || 'unknown').slice(0, 120);
			histogram.set(key, (histogram.get(key) || 0) + 1);
		}
		console.log(`errors:`);
		for (const [key, n] of [...histogram].sort((a, b) => b[1] - a[1])) console.log(`  ${n} x ${key}`);
	}
	console.log(`state written to ${args.state}, now run: node reveal-burst.ts watch --state ${args.state}`);
}

// ------------------------------------------------------------------------------------------------
// watch
// ------------------------------------------------------------------------------------------------
async function watch() {
	const state: State = JSON.parse(fs.readFileSync(args.state as string, 'utf-8'));
	const pollSeconds = int('poll', args.poll);
	const pollConcurrency = int('poll-concurrency', args['poll-concurrency']);
	const deadline = state.revealAt + state.windowSeconds;
	const pending = () => state.entries.filter((e) => e.scheduled && !e.hash);

	console.log(
		`watching ${state.entries.filter((e) => e.scheduled).length} executions, reveal at ` +
			`${new Date(state.revealAt * 1000).toISOString()}, window closes ${new Date(deadline * 1000).toISOString()}`,
	);

	let lastCount = state.entries.filter((e) => e.hash).length;
	let lastTime = now();
	while (pending().length > 0 && now() < deadline + 60) {
		if (now() < state.revealAt) {
			const wait = Math.min(state.revealAt - now(), 30);
			console.log(`  reveal in ${Math.round(state.revealAt - now())}s`);
			await sleep(wait * 1000);
			continue;
		}
		await pool(pending(), pollConcurrency, async (entry) => {
			try {
				const response = await fetch(
					`${state.fuzd}/api/execution/execution/${state.chainId}/${entry.signer}/${state.slot}/0`,
				);
				const json = await response.json();
				if (json.success && json.execution) {
					entry.hash = json.execution.hash;
					entry.broadcastTime = json.execution.broadcastTime;
					entry.seenAt = now();
				}
			} catch {
				// a failed poll is retried next round
			}
		});
		const broadcast = state.entries.filter((e) => e.hash).length;
		const t = now();
		const ratePerMinute = ((broadcast - lastCount) / (t - lastTime)) * 60;
		console.log(
			`  +${Math.round(t - state.revealAt)}s: ${broadcast}/${state.entries.filter((e) => e.scheduled).length} broadcast ` +
				`(${ratePerMinute.toFixed(1)}/min since last poll)`,
		);
		lastCount = broadcast;
		lastTime = t;
		saveState(args.state as string, state);
		if (pending().length > 0) await sleep(pollSeconds * 1000);
	}

	// why are the missing ones missing?
	await pool(pending(), pollConcurrency, async (entry) => {
		try {
			const response = await fetch(
				`${state.fuzd}/api/scheduling/scheduledExecution/${state.chainId}/${entry.signer}/${state.slot}`,
			);
			const json = await response.json();
			const e = json.execution;
			entry.finalStatus = e
				? `queued: checkinTime=${e.checkinTime} retries=${e.retries} lastError=${e.lastError || '-'}`
				: `not in queue (archived: expired or dropped)`;
		} catch (err) {
			entry.finalStatus = `status request failed: ${shortError(err)}`;
		}
	});
	saveState(args.state as string, state);

	const scheduled = state.entries.filter((e) => e.scheduled);
	const delayOf = (e: Entry) => (e.broadcastTime ?? e.seenAt ?? 0) - state.revealAt;
	const inTime = scheduled.filter((e) => e.hash && delayOf(e) <= state.windowSeconds);
	const late = scheduled.filter((e) => e.hash && delayOf(e) > state.windowSeconds);
	const missing = scheduled.filter((e) => !e.hash);

	console.log(`\n== reveal report ==`);
	console.log(`in time:  ${inTime.length}/${scheduled.length}`);
	console.log(`late:     ${late.length} (broadcast after the window closed)`);
	console.log(`missing:  ${missing.length} (never broadcast)`);
	console.log(`delay after reveal, s: ${percentiles(scheduled.filter((e) => e.hash).map(delayOf))}`);

	const perMinute = new Map<number, number>();
	for (const e of scheduled.filter((e) => e.hash)) {
		const minute = Math.floor(delayOf(e) / 60);
		perMinute.set(minute, (perMinute.get(minute) || 0) + 1);
	}
	console.log(`broadcasts per minute after reveal:`);
	for (const [minute, n] of [...perMinute].sort((a, b) => a[0] - b[0])) {
		console.log(`  min ${String(minute).padStart(3)}: ${'#'.repeat(Math.min(n, 80))} ${n}`);
	}
	if (missing.length > 0) {
		const histogram = new Map<string, number>();
		for (const e of missing) histogram.set(e.finalStatus || '?', (histogram.get(e.finalStatus || '?') || 0) + 1);
		console.log(`missing, by status:`);
		for (const [key, n] of [...histogram].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${n} x ${key}`);
	}
	if (late.length + missing.length > 0) process.exitCode = 1;
}

if (command === 'schedule') {
	await schedule();
} else if (command === 'watch') {
	await watch();
} else {
	console.error(`usage: node reveal-burst.ts <schedule|watch> [options], see README.md`);
	process.exitCode = 2;
}

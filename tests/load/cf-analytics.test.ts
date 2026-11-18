/**
 * The parsing and formatting of cf-analytics.ts, against an answer recorded from the analytics API
 * (fuzd-cf-worker-staging, 2026-11-18 16:22 to 16:25 UTC, during a load test): no network.
 *
 *   node --test cf-analytics.test.ts
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accountFromWhoami, formatTable, parseResponse, parseTime} from './cf-analytics.ts';

const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/cf-analytics-sample.json', import.meta.url), 'utf8'));

test('reads both datasets, per minute, with times in milliseconds', () => {
	const rows = parseResponse(sample);
	assert.equal(rows.length, 10);
	assert.deepEqual(rows[0], {
		dataset: 'durable-objects',
		minute: '2026-11-18T16:22:00Z',
		requests: 8,
		errors: 0,
		cpuP50: 1.546,
		cpuP99: 770.946,
		wallP50: 348.048,
		wallP99: 5023.515,
		wallTotal: 21226.425,
	});
	const fetches = rows.filter((v) => v.eventType === 'fetch');
	assert.deepEqual(
		fetches.map((v) => [v.minute, v.requests]),
		[
			['2026-11-18T16:23:00Z', 1520],
			['2026-11-18T16:24:00Z', 4512],
		],
	);
	// sorted by minute, then source
	assert.deepEqual(
		rows.slice(0, 3).map((v) => `${v.minute} ${v.dataset} ${v.eventType || ''}`.trim()),
		[
			'2026-11-18T16:22:00Z durable-objects',
			'2026-11-18T16:22:00Z worker cron',
			'2026-11-18T16:23:00Z durable-objects',
		],
	);
});

test('prints a table in seconds, with the totals per source', () => {
	const table = formatTable(parseResponse(sample));
	const lines = table.split('\n');
	assert.match(
		lines[0],
		/^minute \(UTC\)\s+source\s+invocations\s+errors\s+cpu p50\s+cpu p99\s+wall p50\s+wall p99\s+cpu sum$/,
	);
	assert.match(lines[1], /^2026-11-18 16:22\s+durable object\s+8\s+0\s+0\.00\s+0\.77\s+0\.35\s+5\.02$/);
	assert.ok(lines.some((v) => /^2026-11-18 16:24\s+worker fetch\s+4512\s+0\s+.*266\.5$/.test(v)));
	assert.equal(
		lines.at(-1),
		'times in seconds; invocations in total: durable object: 164, worker cron: 9, worker fetch: 6032',
	);
});

test('reports a GraphQL error, and an account it cannot read', () => {
	assert.throws(() => parseResponse({data: null, errors: [{message: 'not authorized'}]}), /not authorized/);
	assert.throws(() => parseResponse({data: {viewer: {accounts: []}}, errors: null}), /no such account/);
});

test('takes relative and absolute times', () => {
	const now = Date.parse('2026-11-18T17:00:00Z');
	assert.equal(parseTime('-30m', now), '2026-11-18T16:30:00.000Z');
	assert.equal(parseTime('-2h', now), '2026-11-18T15:00:00.000Z');
	assert.equal(parseTime('-0m', now), '2026-11-18T17:00:00.000Z');
	assert.equal(parseTime('2026-11-18T16:22:00Z', now), '2026-11-18T16:22:00.000Z');
	assert.throws(() => parseTime('yesterday', now), /not a time/);
});

test('finds the account id in `wrangler whoami`', () => {
	const whoami = `👋 You are logged in with an API Token, associated with the email someone@example.com.
┌──────────────────────────────┬──────────────────────────────────┐
│ Account Name                 │ Account ID                       │
├──────────────────────────────┼──────────────────────────────────┤
│ Someone's Account            │ 0123456789abcdef0123456789abcdef │
└──────────────────────────────┴──────────────────────────────────┘`;
	assert.equal(accountFromWhoami(whoami), '0123456789abcdef0123456789abcdef');
	assert.throws(() => accountFromWhoami('not logged in'), /pass --account/);
	assert.throws(() => accountFromWhoami(`${whoami}\n│ Other │ fedcba9876543210fedcba9876543210 │`), /several accounts/);
});

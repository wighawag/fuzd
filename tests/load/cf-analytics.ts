#!/usr/bin/env node
/**
 * Per-minute invocations of a fuzd Worker on Cloudflare, with CPU and wall-time quantiles, from the
 * GraphQL analytics API. `wrangler tail` samples during a burst and drops most busy invocations
 * (and their logs); the analytics API counts every one.
 *
 *   CLOUDFLARE_API_TOKEN=... node cf-analytics.ts --script fuzd-cf-worker-staging --since -30m
 *
 * Two datasets: `durableObjectsInvocationsAdaptiveGroups` (the processing loops' alarms) and
 * `workersInvocationsAdaptive` (the Worker itself: requests and crons, split by event type).
 * The account id comes from --account, else from `wrangler whoami` (CLOUDFLARE_ACCOUNT_ID too).
 * Run with node >= 23 (it strips the types itself), see README.md.
 */
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

export type MinuteRow = {
	dataset: 'durable-objects' | 'worker';
	minute: string; // ISO, start of the minute
	eventType?: string; // worker only: fetch, scheduled, ...
	requests: number;
	errors: number;
	// milliseconds
	cpuP50: number;
	cpuP99: number;
	wallP50: number;
	wallP99: number;
	wallTotal: number;
	cpuTotal?: number; // worker only (the DO dataset has no CPU sum)
};

export const QUERY = `query fuzdInvocations($account: string!, $script: string!, $since: Time!, $until: Time!) {
	viewer {
		accounts(filter: {accountTag: $account}) {
			durableObjectsInvocationsAdaptiveGroups(
				limit: 10000
				filter: {scriptName: $script, datetime_geq: $since, datetime_leq: $until}
				orderBy: [datetimeMinute_ASC]
			) {
				dimensions { datetimeMinute }
				sum { requests errors wallTime }
				quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }
			}
			workersInvocationsAdaptive(
				limit: 10000
				filter: {scriptName: $script, datetime_geq: $since, datetime_leq: $until}
				orderBy: [datetimeMinute_ASC]
			) {
				dimensions { datetimeMinute eventType }
				sum { requests errors cpuTimeUs wallTime }
				quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }
			}
		}
	}
}`;

// the analytics API reports CPU and wall times in microseconds
const ms = (us: unknown) => (typeof us === 'number' ? us / 1000 : 0);

/** The rows of a GraphQL answer to QUERY, sorted by minute; throws on a GraphQL error. */
export function parseResponse(response: any): MinuteRow[] {
	if (response?.errors?.length) {
		throw new Error(`analytics API: ${response.errors.map((v: any) => v.message).join('; ')}`);
	}
	const accounts = response?.data?.viewer?.accounts;
	if (!Array.isArray(accounts) || accounts.length === 0) {
		throw new Error('analytics API: no such account (or the token cannot read its analytics)');
	}
	const account = accounts[0];
	const rows: MinuteRow[] = [];
	for (const group of account.durableObjectsInvocationsAdaptiveGroups || []) {
		rows.push({
			dataset: 'durable-objects',
			minute: group.dimensions.datetimeMinute,
			requests: group.sum.requests,
			errors: group.sum.errors,
			cpuP50: ms(group.quantiles.cpuTimeP50),
			cpuP99: ms(group.quantiles.cpuTimeP99),
			wallP50: ms(group.quantiles.wallTimeP50),
			wallP99: ms(group.quantiles.wallTimeP99),
			wallTotal: ms(group.sum.wallTime),
		});
	}
	for (const group of account.workersInvocationsAdaptive || []) {
		rows.push({
			dataset: 'worker',
			minute: group.dimensions.datetimeMinute,
			eventType: group.dimensions.eventType,
			requests: group.sum.requests,
			errors: group.sum.errors,
			cpuP50: ms(group.quantiles.cpuTimeP50),
			cpuP99: ms(group.quantiles.cpuTimeP99),
			wallP50: ms(group.quantiles.wallTimeP50),
			wallP99: ms(group.quantiles.wallTimeP99),
			wallTotal: ms(group.sum.wallTime),
			cpuTotal: ms(group.sum.cpuTimeUs),
		});
	}
	return rows.sort(
		(a, b) =>
			a.minute.localeCompare(b.minute) ||
			a.dataset.localeCompare(b.dataset) ||
			(a.eventType || '').localeCompare(b.eventType || ''),
	);
}

function seconds(milliseconds: number | undefined) {
	return milliseconds === undefined ? '' : (milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1);
}

/** A plain-text table: one line per minute and source, times in seconds. */
export function formatTable(rows: MinuteRow[]): string {
	const header = [
		'minute (UTC)',
		'source',
		'invocations',
		'errors',
		'cpu p50',
		'cpu p99',
		'wall p50',
		'wall p99',
		'cpu sum',
	];
	const lines = rows.map((row) => [
		row.minute.slice(0, 16).replace('T', ' '),
		row.dataset === 'durable-objects' ? 'durable object' : `worker ${row.eventType || ''}`.trim(),
		String(row.requests),
		String(row.errors),
		seconds(row.cpuP50),
		seconds(row.cpuP99),
		seconds(row.wallP50),
		seconds(row.wallP99),
		seconds(row.cpuTotal),
	]);
	const widths = header.map((title, i) => Math.max(title.length, ...lines.map((line) => line[i].length)));
	const format = (cells: string[]) =>
		cells
			.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i])))
			.join('  ')
			.trimEnd();
	const totals = new Map<string, number>();
	for (const row of rows) {
		const source = row.dataset === 'durable-objects' ? 'durable object' : `worker ${row.eventType || ''}`.trim();
		totals.set(source, (totals.get(source) || 0) + row.requests);
	}
	const summary = [...totals].map(([source, n]) => `${source}: ${n}`).join(', ');
	return [
		format(header),
		...lines.map(format),
		'',
		`times in seconds; invocations in total: ${summary || 'none'}`,
	].join('\n');
}

/** `-30m`, `-2h`, `-1d` (before now), or anything Date understands (an ISO time). */
export function parseTime(value: string, now = Date.now()): string {
	const relative = /^-(\d+(?:\.\d+)?)([mhd])$/.exec(value);
	if (relative) {
		const unit = {m: 60_000, h: 3_600_000, d: 86_400_000}[relative[2] as 'm' | 'h' | 'd'];
		return new Date(now - Number(relative[1]) * unit).toISOString();
	}
	const time = new Date(value);
	if (isNaN(time.getTime())) {
		throw new Error(`not a time: ${value} (use -30m, -2h, -1d or an ISO time)`);
	}
	return time.toISOString();
}

/** The account id in `wrangler whoami`'s table, when it lists exactly one account. */
export function accountFromWhoami(output: string): string {
	const ids = [...new Set(output.match(/\b[0-9a-f]{32}\b/g) || [])];
	if (ids.length !== 1) {
		throw new Error(
			ids.length === 0
				? 'no account id in `wrangler whoami`: pass --account'
				: `several accounts in \`wrangler whoami\` (${ids.join(', ')}): pass --account`,
		);
	}
	return ids[0];
}

async function main() {
	const {values: args} = parseArgs({
		options: {
			script: {type: 'string', default: 'fuzd-cf-worker-staging'},
			account: {type: 'string'},
			since: {type: 'string', default: '-60m'},
			until: {type: 'string', default: '-0m'},
			json: {type: 'boolean', default: false},
			help: {type: 'boolean', default: false},
		},
	});
	if (args.help) {
		console.log(
			'node cf-analytics.ts [--script fuzd-cf-worker-staging] [--account <id>] [--since -60m] [--until -0m] [--json]',
		);
		return;
	}
	const token = process.env.CLOUDFLARE_API_TOKEN;
	if (!token) {
		throw new Error('set CLOUDFLARE_API_TOKEN (a token with Account Analytics: Read), see README.md');
	}
	let account = args.account || process.env.CLOUDFLARE_ACCOUNT_ID;
	if (!account) {
		const cfWorker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../platforms/cf-worker');
		const output = execFileSync('npx', ['wrangler', 'whoami'], {cwd: cfWorker, encoding: 'utf8', timeout: 60_000});
		account = accountFromWhoami(output);
	}
	const variables = {account, script: args.script, since: parseTime(args.since), until: parseTime(args.until)};
	const response = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
		body: JSON.stringify({query: QUERY, variables}),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		throw new Error(`analytics API: HTTP ${response.status} ${await response.text()}`);
	}
	const json = await response.json();
	if (args.json) {
		console.log(JSON.stringify(json, null, 2));
		return;
	}
	console.log(`${args.script}, ${variables.since} to ${variables.until}`);
	console.log(formatTable(parseResponse(json)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(err.message || err);
		process.exit(1);
	});
}

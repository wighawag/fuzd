import type {RemoteSQL} from 'remote-sql';

/** The claim columns (docs/adr/0004) and their index, added to a table created before them. */
export async function setupClaimColumns(db: RemoteSQL, table: string) {
	await addMissingColumns(db, table, {claimedBy: 'text', claimExpiresAt: 'integer'});
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_claimedBy ON ${table} (claimedBy);`).all();
}

/**
 * Add the columns a table created by an older version lacks. SQLite has no ADD COLUMN IF NOT EXISTS,
 * and CREATE TABLE IF NOT EXISTS leaves an existing table as it is, so the setup checks first.
 */
export async function addMissingColumns(db: RemoteSQL, table: string, columns: Record<string, string>) {
	const {results} = await db.prepare(`PRAGMA table_info(${table});`).all<{name: string}>();
	if (results.length === 0) {
		return; // not created yet: its CREATE TABLE has every column
	}
	const existing = new Set(results.map((v) => v.name));
	const missing = Object.entries(columns).filter(([name]) => !existing.has(name));
	if (missing.length > 0) {
		await db.batch(missing.map(([name, type]) => db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`)));
	}
}

/**
 * Slots per statement that lists slots as (account, slot) pairs: D1 takes at most 100 bound
 * parameters per statement, 2 per slot plus a few for the rest.
 */
export const MAX_SLOTS_PER_STATEMENT = 40;

export function chunks<T>(list: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < list.length; i += size) {
		result.push(list.slice(i, i + size));
	}
	return result;
}

export function toValues(inDB: Record<string, any>): {
	columns: string;
	values: any[];
	bindings: string;
	overwrites: string;
} {
	let columnStr = '';
	const values = [];
	let bindingsStr = '';
	let overwritesStr = '';

	const keys = Object.keys(inDB);
	for (const column of keys) {
		const value = inDB[column];
		if (values.length == 0) {
			// first element only
			columnStr += column;
			bindingsStr += '?';
			overwritesStr += `${column}=excluded.${column}, `;
		} else {
			columnStr += `, ${column}`;
			bindingsStr += ', ?';
			if (values.length === keys.length - 1) {
				// last element only
				overwritesStr += `${column}=excluded.${column}`;
			} else {
				overwritesStr += `${column}=excluded.${column}, `;
			}
		}
		values.push(value);
	}
	return {
		columns: columnStr,
		values,
		bindings: bindingsStr,
		overwrites: overwritesStr,
	};
}

export function sqlToStatements(sqlText: string) {
	return (
		sqlText
			// remove comments
			.replace(/(\/\*[^*]*\*\/)|(\/\/[^*]*)|(--[^.].*)/gm, '')
			// remove new lines
			.replace(/[\r\n]/gm, '')
			// remove extra space
			.replace(/\s+/g, ' ')
			// split in statements
			.split(';')
			.map((v) => v + ';')
			.filter((v) => v.trim() != ';')
	);
}

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
		const valueStr = value === null ? 'NULL' : `'${value}'`;
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
		values.push(valueStr);
	}
	return {
		columns: columnStr,
		values,
		bindings: bindingsStr,
		overwrites: overwritesStr,
	};
}

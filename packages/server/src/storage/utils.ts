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

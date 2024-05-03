export function toValues(inDB: Record<string, any>): {columns: string; values: any[]; bindings: string} {
	let columnStr = '';
	const values = [];
	let bindingsStr = '';

	const keys = Object.keys(inDB);
	for (const column of keys) {
		const value = inDB[column].toString();
		values.push(value);
		if (columnStr.length == 0) {
			columnStr += column;
			bindingsStr += '?';
		} else {
			columnStr += `, ${column}`;
			bindingsStr += ', ?';
		}
	}
	return {
		columns: columnStr,
		values,
		bindings: bindingsStr,
	};
}

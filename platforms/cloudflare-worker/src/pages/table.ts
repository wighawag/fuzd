function isDefined(x: unknown): boolean {
	return x !== undefined && x !== null;
}

export type TablifyOptions = {
	data?: {[field: string]: unknown}[];
	header?: string[];
	border?: number;
	cellspacing?: number;
	cellpadding?: number;
	table_id?: string;
	table_class?: string;
	header_mapping?: {[key: string]: string};
	pretty?: boolean;
	css?: string;
};

export function tablify(options?: TablifyOptions) {
	options = options || {};
	var tableData = options.data || [];
	var header = options.header;
	var border = isDefined(options.border) ? options.border : 1;
	var cellspacing = isDefined(options.cellspacing) ? options.cellspacing : 0;
	var cellpadding = isDefined(options.cellpadding) ? options.cellpadding : 0;
	var tableId = options.table_id || 'tablify';
	var tableClass = options.table_class || 'tablify';
	var header_mapping = options.header_mapping || {};
	var pretty = options.pretty;
	if (pretty === undefined) {
		pretty = true;
	}
	var isSingleRow = false;
	if (!Array.isArray(tableData)) {
		isSingleRow = true;
		tableData = [tableData];
	}

	// If header exists in options use that else create it.
	if (!header) {
		var headerObj: {[field: string]: boolean} = {};
		tableData.forEach(function (json) {
			var keys = Object.keys(json);
			keys.forEach(function (key) {
				headerObj[key] = true;
			});
		});
		header = Object.keys(headerObj);
	}

	let headerToUse = header;

	if (isSingleRow && tableData.length === 1) {
		// Don't create row if value is not defined for the header (key for objects)
		headerToUse = headerToUse.filter(function (h) {
			return tableData[0][h];
		});
	}

	// Generate table
	var htmlTable = '';
	var cellArray: string[][] = [];
	var cellRow: string[] = [];
	cellArray.push(cellRow);
	headerToUse.forEach(function (key) {
		cellRow.push('<th>' + (header_mapping[key] || key) + '</th>');
	});
	tableData.forEach(function (json) {
		cellRow = [];
		cellArray.push(cellRow);
		headerToUse.forEach(function (key) {
			var value = json[key];
			if (value === undefined) {
				value = '';
			} else if (typeof value !== 'string') {
				value = JSON.stringify(value);
			}
			cellRow.push('<td>' + value + '</td>');
		});
	});

	var i, j;
	if (isSingleRow && cellArray.length) {
		// Transpose the array to show object as key-value pair instead of table
		cellArray = cellArray[0].map(function (col, i) {
			return cellArray.map(function (row) {
				return row[i];
			});
		});
	}

	var newLine = '';
	var indent = '';
	if (pretty) {
		newLine = '\n';
		indent = '  ';
	}
	if (options.css) {
		htmlTable += `<style>${newLine}${indent}${options.css}${newLine}</style>${newLine}`;
	}
	if (tableData.length) {
		htmlTable +=
			'<table id="' +
			tableId +
			'" class="' +
			tableClass +
			'" border="' +
			border +
			'" cellspacing="' +
			cellspacing +
			'" cellpadding="' +
			cellpadding +
			'">';
		for (i = 0; i < cellArray.length; i++) {
			htmlTable += newLine;
			htmlTable += indent;
			htmlTable += '<tr>';
			for (j = 0; j < cellArray[i].length; j++) {
				htmlTable += newLine;
				htmlTable += indent;
				htmlTable += indent;
				htmlTable += cellArray[i][j];
			}
			htmlTable += newLine;
			htmlTable += indent;
			htmlTable += '</tr>';
		}
		htmlTable += newLine;
		htmlTable += '</table>';
	}
	return htmlTable;
}

/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import {FC, jsx} from 'hono/jsx';

export type TableData = {[key: string]: any}[];

export const Table: FC<{data: TableData}> = (props: {data: TableData}) => {
	if (props.data.length === 0) {
		return <p>Nothing to see</p>;
	}

	const keys = Object.keys(props.data[0]);
	return (
		<table role="table">
			<thead role="rowgroup">
				<tr role="row">
					{keys.map((key) => (
						<th role="columnheader">{key}</th>
					))}
				</tr>
			</thead>
			<tbody role="rowgroup">
				{props.data.map((item) => (
					<tr role="row">
						{keys.map((key) => (
							<td data-label={key} role="cell">
								{item[key] as string}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
};

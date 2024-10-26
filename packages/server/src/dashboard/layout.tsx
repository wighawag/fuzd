/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import {FC, jsx} from 'hono/jsx';
import globalCss from './styles/ts/global.css.js';
import {html, raw} from 'hono/html';

export const Layout: FC = (props) =>
	html`<!doctype html>
		<html>
			<head>
				<meta charset="UTF-8" />
				<title>${props.title}</title>
				<meta name="description" content="${props.description}" />
				<style>
					${raw(globalCss)}
				</style>
			</head>
			<body>
				${props.children}
			</body>
		</html> `;

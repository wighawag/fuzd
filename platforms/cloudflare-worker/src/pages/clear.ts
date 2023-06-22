import {TablifyOptions, tablify} from './table';
import {html} from './utils';

export function clear(token: string) {
	return html(`<!DOCTYPE html>
    <body>
      <h1>Clear</h1>
      <form action="." method="POST">
        <button>clear</button>
        <input type="hidden" id="token" name="token" value="${token}">
      </form>
    </body>`);
}

export function table(options: TablifyOptions & {data: {[field: string]: unknown}[]}) {
	return html(`<!DOCTYPE html>
    <body>
      ${tablify(options)}
    </body>`);
}

export function html(str: string) {
	return new Response(str, {
		headers: {
			'content-type': 'text/html;charset=UTF-8',
		},
	});
}

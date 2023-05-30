export const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400',
};

export function createResponse(data: any, options?: {status: number}): Response {
	return new Response(JSON.stringify(data, null, '  '), {
		headers: {
			...corsHeaders,
			'content-type': 'application/json;charset=UTF-8',
		},
		status: options?.status,
	});
}

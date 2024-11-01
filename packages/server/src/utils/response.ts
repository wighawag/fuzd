// import {Context, Env, Input, TypedResponse} from 'hono';
// import {HTTPResponseError} from 'hono/types';
// import {StatusCode} from 'hono/utils/http-status';
// import {InvalidJSONValue, JSONParsed, JSONValue, SimplifyDeepArray} from 'hono/utils/types';

// type JSONRespondReturn<
// 	T extends JSONValue | SimplifyDeepArray<unknown> | InvalidJSONValue,
// 	U extends StatusCode,
// > = Response &
// 	TypedResponse<
// 		SimplifyDeepArray<T> extends JSONValue ? (JSONValue extends SimplifyDeepArray<T> ? never : JSONParsed<T>) : never,
// 		U,
// 		'json'
// 	>;

// export async function handleErrors<C extends Context, T extends JSONValue>(
// 	c: C,
// 	func: (c: C) => Promise<T>,
// ): Promise<
// 	| JSONRespondReturn<T, 200>
// 	| JSONRespondReturn<{success: false; errors: {name?: string; code?: number; status?: number; message: string}[]}, 500>
// > {
// 	try {
// 		const result = (await func(c)) as T;
// 		return c.json(result);
// 	} catch (err: any) {
// 		return c.json(
// 			{
// 				success: false,
// 				errors: [
// 					{
// 						name: 'name' in err ? err.name : undefined,
// 						code: 'code' in err ? err.code : 5000,
// 						status: 'status' in err ? err.status : undefined,
// 						message: err.message,
// 						// cause: err.cause,
// 						// stack: err.stack
// 					},
// 				],
// 			},
// 			500,
// 		);
// 	}
// }

export function createErrorObject(err: any) {
	return {
		success: false,
		errors: [
			{
				name: 'name' in err ? err.name : undefined,
				code: 'code' in err ? err.code : 5000,
				status: 'status' in err ? err.status : undefined,
				message: err.message,
				// cause: err.cause,
				// stack: err.stack
			},
		],
	} as const;
}

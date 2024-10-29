import {Context} from 'hono';
import {HonoBase} from 'hono/hono-base';
import {Bindings, Endpoint, Schema} from 'hono/types';
import {RemoteSQL} from 'remote-sql';

export type ServerOptions<Env extends Bindings = Bindings> = {
	getDB: (c: Context<{Bindings: Env}>) => RemoteSQL;
	getEnv: (c: Context<{Bindings: Env}>) => Env;
};

export type ServerObject = {
	fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
};

export type GetSchema<T extends HonoBase<any, any>> = T extends HonoBase<infer E, infer S> ? Schema : never;

type WithErrorResponse<T extends Endpoint, ErrorType> = T extends {output: infer O}
	? O extends string | number | boolean | null | undefined
		? Omit<T, 'output'> & {output: O | ErrorType}
		: Omit<T, 'output'> & {output: O | ErrorType}
	: T;

// does not work, status is not propagated to Response object ok or status property
type WithConditionalErrorResponse<T, ErrorType> = T extends {output: infer O; status: infer S}
	? S extends 200 | 201 | 204
		? T
		: O extends string | number | boolean | null | undefined
			? Omit<T, 'output'> & {output: O | ErrorType}
			: Omit<T, 'output'> & {output: O | ErrorType}
	: T;

type AddToAllSchemaOutputs<S extends Schema, ErrorType> = {
	[K in keyof S]: {
		[M in keyof S[K]]: S[K][M] extends Endpoint ? WithErrorResponse<S[K][M], ErrorType> : never;
	};
};
export type AddToAllOutputs<T extends HonoBase<any, any>, ErrorType> =
	T extends HonoBase<infer E, infer S> ? HonoBase<E, AddToAllSchemaOutputs<S, ErrorType>> : T;

// export type ReplaceSchema<T extends HonoBase<any, any>, S extends Schema> =
// 	T extends HonoBase<infer E, any> ? HonoBase<E, S> : T;

// doing in multiple step seems to allow to bypass typescript limit
// so instade of _AddToAllOutputs we reimplement this way:
// export type AddToAllOutputs<T extends HonoBase<any, any>, ErrorType> = ReplaceSchema<
// 	T,
// 	AddToAllSchemaOutputs<GetSchema<T>, ErrorType>
// >;

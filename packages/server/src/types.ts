import {Context} from 'hono';
import {HonoBase} from 'hono/hono-base';
import {Bindings, Schema} from 'hono/types';
import {RemoteSQL} from 'remote-sql';

export type ServerOptions<Env extends Bindings = Bindings> = {
	getDB: (c: Context<{Bindings: Env}>) => RemoteSQL;
	getEnv: (c: Context<{Bindings: Env}>) => Env;
};

export type ServerObject = {
	fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
};

type WithErrorResponse<T, ErrorType> = T extends {output: infer O}
	? O extends string | number | boolean | null | undefined
		? Omit<T, 'output'> & {output: O | ErrorType}
		: Omit<T, 'output'> & {output: O | ErrorType}
	: T;

// Utility type to modify the schema
export type AddToAllOutputs<T, ErrorType> =
	T extends HonoBase<infer E, infer S>
		? HonoBase<
				E,
				{
					[K in keyof S]: S[K] extends {[method: string]: any}
						? {
								[M in keyof S[K]]: M extends `$${string}` ? WithErrorResponse<S[K][M], ErrorType> : S[K][M];
							}
						: S[K] extends object
							? AddToAllOutputs<S[K], ErrorType>
							: S[K];
				}
			>
		: T;

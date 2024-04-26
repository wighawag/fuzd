import {Context} from 'hono';
import {Bindings} from 'hono/types';
import {RemoteSQL} from 'remote-sql';

export type ServerOptions<Env extends Bindings = Bindings> = {
	getDB: (c: Context<{Bindings: Env}>) => RemoteSQL;
};

export type ServerObject = {
	fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
};

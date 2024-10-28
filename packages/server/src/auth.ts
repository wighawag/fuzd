import {MiddlewareHandler} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {assert} from 'typia';
import {hashMessage, recoverAddress} from 'viem';

export type AuthOptions = {
	debug?: boolean;
};

declare module 'hono' {
	interface ContextVariableMap {
		account: `0x${string}`;
	}
}

export function auth(options: AuthOptions): MiddlewareHandler {
	return async (c, next) => {
		const jsonAsString = await c.req.text();
		const signature = c.req.header()['signature'] as `0x${string}`;
		const hash = hashMessage(jsonAsString);
		if (!signature) {
			throw new HTTPException(400, {
				message: `signature not provided`,
			});
		}
		let account: `0x${string}`;
		if (options?.debug && signature.startsWith('debug@')) {
			account = signature.split('@')[1] as `0x${string}`;
		} else {
			try {
				account = assert(await recoverAddress({hash, signature}));
			} catch (err: any) {
				throw new HTTPException(400, {
					message: 'failed to recover address from message and signature',
					cause: err,
				});
			}
		}
		c.set('account', account);

		return next();
	};
}

import {String0x} from 'fuzd-common';
import {MiddlewareHandler} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {assert} from 'typia';
import {hashMessage, recoverAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

export type AuthOptions = {
	debug?: boolean;
	signReception?: boolean;
};

declare module 'hono' {
	interface ContextVariableMap {
		account: String0x;
		receptionSignature?: String0x;
	}
}

export function auth(options: AuthOptions): MiddlewareHandler {
	return async (c, next) => {
		const jsonAsString = await c.req.text();
		const signature = c.req.header()['signature'] as String0x;
		const hash = hashMessage(jsonAsString);
		if (!signature) {
			throw new HTTPException(400, {
				message: `signature not provided`,
			});
		}
		let account: String0x;
		if (options?.debug && signature.startsWith('debug@')) {
			account = signature.split('@')[1] as String0x;
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

		if (options.signReception) {
			const config = c.get('config');
			const serverAccount = config.account;
			const wallet = privateKeyToAccount(serverAccount.privateKey);
			const receptionSignature = await wallet.signMessage({message: jsonAsString});
			c.set('receptionSignature', receptionSignature);
		}

		return next();
	};
}

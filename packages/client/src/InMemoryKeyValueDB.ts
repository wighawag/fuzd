import type {KeyValueDB, ListOptions, TransactionOperations} from 'atomikv';

export function createInMemoryKeyValueDB(): KeyValueDB {
	const db: {[key: string]: unknown} = {};

	const get = (async (key: string | string[]) => {
		if (typeof key === 'string') {
			return db[key];
		} else {
			let result = new Map();
			for (const k of key) {
				const obj = await get(k);
				if (obj) {
					result.set(k, obj);
				}
			}
			return result;
		}
	}) as KeyValueDB['get'];
	const del = (async (key: string | string[]) => {
		if (typeof key === 'string') {
			const obj = await get(key);
			if (obj) {
				delete db[key];
				return true;
			}
			return false;
		} else {
			const objMap = await get(key);
			for (const k of key) {
				delete db[k];
			}
			return objMap.size;
		}
	}) as KeyValueDB['delete'];
	const put = (async (key: string | {[key: string]: unknown}, value?: unknown) => {
		if (typeof key === 'string') {
			db[key] = value;
		} else {
			for (const k of Object.entries(key)) {
				db[k[0]] = k[1];
			}
		}
	}) as KeyValueDB['put'];

	const list = (async (options: ListOptions): Promise<Map<string, unknown>> => {
		const result = new Map();
		const keys = Object.keys(db).sort();

		let keysFound: string[] = [];

		let start: {key: string; index: number} | undefined;

		let end: string | undefined = 'end' in options ? options.end : undefined;
		let limit: number | undefined = 'limit' in options ? options.limit : undefined;

		if (options.prefix) {
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				if (key.startsWith(options.prefix)) {
					start = {key, index: i};
					break;
				}
			}
			if (!start) {
				return result;
			}
			let i = start.index;
			while (i < keys.length) {
				const key = keys[i];
				if (!key.startsWith(options.prefix)) {
					break;
				}

				if (!end || key < end) {
					keysFound.push(key);
					if (limit && keysFound.length >= limit) {
						break;
					}
				} else {
					break;
				}
				i++;
			}
		} else {
			throw new Error(`ListOptions not supported, prefix needed`);
		}

		return get(keysFound);
	}) as KeyValueDB['list'];

	const kv = {
		get,
		put,
		delete: del,
		list,
		transaction,
	};

	async function transaction(closure: (txn: TransactionOperations) => Promise<void>) {
		const {close, txn} = createTransactionStore(kv, db);
		try {
			await closure(txn);
		} catch {
			txn.rollback();
		} finally {
			close();
		}
	}
	return kv;
}

function createTransactionStore(
	kv: KeyValueDB,
	origDB: {[key: string]: unknown}
): {txn: TransactionOperations; close: () => void} {
	const db: {[key: string]: unknown} = {};
	const deletions: {[key: string]: boolean} = {};

	let _rolledBack = false;
	function rollback() {
		_rolledBack = true;
	}

	const get = (async (key: string | string[]) => {
		if (_rolledBack) {
			throw new Error(`Rolled back`);
		}
		if (typeof key === 'string') {
			if (deletions[key]) {
				return undefined;
			}
			const obj = db[key];
			if (obj) {
				return obj;
			} else {
				return kv.get(key);
			}
		} else {
			let result = new Map();
			for (const k of key) {
				const obj = await get(k);
				if (obj) {
					result.set(k, obj);
				}
			}
			return result;
		}
	}) as KeyValueDB['get'];
	const del = (async (key: string | string[]) => {
		if (_rolledBack) {
			throw new Error(`Rolled back`);
		}
		if (typeof key === 'string') {
			deletions[key] = true;
			const obj = await get(key);
			if (obj) {
				delete db[key];
				return true;
			}
			return false;
		} else {
			const objMap = await get(key);
			for (const k of key) {
				deletions[k] = true;
				delete db[k];
			}
			return objMap.size;
		}
	}) as KeyValueDB['delete'];
	const put = (async (key: string | {[key: string]: unknown}, value?: unknown) => {
		if (_rolledBack) {
			throw new Error(`Rolled back`);
		}
		if (typeof key === 'string') {
			db[key] = value;
			delete deletions[key];
		} else {
			for (const k of Object.entries(key)) {
				delete deletions[k[0]];
				db[k[0]] = k[1];
			}
		}
	}) as KeyValueDB['put'];

	const list = (async (options: ListOptions): Promise<Map<string, unknown>> => {
		if (_rolledBack) {
			throw new Error(`Rolled back`);
		}

		const mergedDB: {[key: string]: unknown} = {};
		for (const entry of Object.entries(origDB)) {
			const key = entry[0];
			const value = entry[1];
			if (!deletions[key]) {
				mergedDB[key] = value;
			}
		}
		for (const entry of Object.entries(db)) {
			const key = entry[0];
			const value = entry[1];
			mergedDB[key] = value;
		}

		const result = new Map();
		const keys = Object.keys(mergedDB).sort();

		let keysFound: string[] = [];

		let start: {key: string; index: number} | undefined;

		let end: string | undefined = 'end' in options ? options.end : undefined;
		let limit: number | undefined = 'limit' in options ? options.limit : undefined;

		if (options.prefix) {
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				if (key.startsWith(options.prefix)) {
					start = {key, index: i};
					break;
				}
			}
			if (!start) {
				return result;
			}
			let i = start.index;
			while (i < keys.length) {
				const key = keys[i];

				if (!end || key < end) {
					keysFound.push(key);
					if (limit && keysFound.length >= limit) {
						break;
					}
				} else {
					break;
				}
				i++;
			}
		} else {
			throw new Error(`ListOptions not supported, prefix needed`);
		}

		return get(keysFound);
	}) as KeyValueDB['list'];

	function close() {
		if (!_rolledBack) {
			for (const entry of Object.entries(db)) {
				const key = entry[0];
				const value = entry[1];
				origDB[key] = value;
			}
			for (const key of Object.keys(deletions)) {
				delete origDB[key];
			}
		}
	}

	return {
		close,
		txn: {
			get,
			put,
			delete: del,
			list,
			rollback,
		},
	};
}

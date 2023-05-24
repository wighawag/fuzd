import type {KeyValueDB, ListOptions} from 'dreveal-executor';

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

	return {
		get,
		put,
		delete: del,
		list,
	};
}

import {afterEach, describe, expect, it} from 'vitest';
import {createClient, type Client} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';

// The fuzd CLI defaults to a `:memory:` database. @libsql/client 0.14.0 to 0.17.4 hand the
// client's only in-memory connection to `transaction()`, after which every call sees a fresh,
// empty database ("no such table"); 0.18.0 keeps it. fuzd's storage calls no transaction()
// today, so this pins the client version that makes it safe to start.

let client: Client | undefined;
afterEach(() => {
	client?.close();
	client = undefined;
});

describe('libsql on :memory:', () => {
	it('keeps one database across batch, execute and transaction()', async () => {
		client = createClient({url: ':memory:'});
		const db = new RemoteLibSQL(client);

		await db.batch([
			db.prepare('CREATE TABLE Items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)'),
			db.prepare('INSERT INTO Items (id, name) VALUES (?1, ?2)').bind(1, 'before'),
		]);

		const transaction = await client.transaction('write');
		await transaction.execute({sql: 'INSERT INTO Items (id, name) VALUES (?, ?)', args: [2, 'inside']});
		await transaction.commit();

		await db.prepare('INSERT INTO Items (id, name) VALUES (?1, ?2)').bind(3, 'after').all();

		const {results} = await db.prepare('SELECT id, name FROM Items ORDER BY id').all<{id: number; name: string}>();
		expect(results.map((v) => [Number(v.id), v.name])).toEqual([
			[1, 'before'],
			[2, 'inside'],
			[3, 'after'],
		]);
	});
});

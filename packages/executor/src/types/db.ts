export type ListOptions = (
	| {
			start: string; // Key at which the list results should start, inclusive.
			prefix?: string; // Restricts results to only include key-value pairs whose keys begin with the prefix.
	  }
	| {
			startAfter: string; // Key after which the list results should start, exclusive. Cannot be used simultaneously with start.
			prefix?: string; // Restricts results to only include key-value pairs whose keys begin with the prefix.
	  }
	| {
			prefix: string; // Restricts results to only include key-value pairs whose keys begin with the prefix.
	  }
) &
	(
		| {
				end: string; // Key at which the list results should end, exclusive.
		  }
		| {
				limit: number; // Maximum number of key-value pairs to return.
		  }
	) & {
		reverse?: boolean; //If true, return results in descending order instead of the default ascending order.
		//Note that enabling this does not change the meaning of start, startKey, or endKey. start still defines the smallest key in lexicographic order that can be returned (inclusive), effectively serving as the endpoint for a reverse-order list. end still defines the largest key in lexicographic order that the list should consider (exclusive), effectively serving as the starting point for a reverse-order list.
	};

/**
 * KeyValue DB
 * Following on cloudflare Durable Object spec
 */
export type KeyValueDB = {
	get<T = unknown>(key: string): Promise<T | undefined>;
	get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
	put<T = unknown>(key: string, value: T): Promise<void>;
	put<T = unknown>(entries: {[key: string]: T}): Promise<void>;
	// Deletes the key and associated value. Returns true if the key existed or false if it did not.
	delete(key: string): Promise<boolean>;
	//Deletes the provided keys and their associated values. Supports up to 128 keys at a time. Returns a count of the number of key-value pairs deleted.
	delete(keys: string[]): Promise<number>;
	list<T = unknown>(options: ListOptions): Promise<Map<string, T>>;
	transaction(closure: (txn: TransactionOperations) => Promise<void>): Promise<void>;
};

export type TransactionOperations = Omit<KeyValueDB, 'transaction'> & {rollback(): void};

export * from './executor/index.js';
export * from './utils/index.js';

export type ErrorData = {
	error: {
		name?: string;
		stack?: string;
		cause?: unknown;
		code?: number;
		status?: unknown;
	};
};
export type WarningData = {
	warning: {
		stack?: string;
		cause?: unknown;
		data?: object;
	};
};
export type TraceData = {
	trace: {
		stack?: string;
		data?: object;
	};
};
export type InfoData = {info: object};
export type DebugData = {
	debug: object;
};
export type LogData = {
	log: object;
};
export type FUZDLogger = {
	readonly assert: (condition: boolean | undefined, message: string, data?: ErrorData) => void;
	readonly error: (message: string, data?: ErrorData) => void;
	readonly warn: (message: string, data?: WarningData) => void;
	readonly info: (message: string, data?: InfoData) => void;
	readonly log: (message: string, data?: LogData) => void;
	readonly debug: (message: string, data?: DebugData) => void;
	readonly dir: (item?: any, options?: any) => void;
	readonly table: (tabularData?: any, properties?: string[]) => void;
	readonly trace: (message: string, data?: TraceData) => void;
	readonly write: (msg: string) => void;
	readonly time: (label: string) => void;
	readonly timeEnd: (label: string) => void;
	readonly timeLog: (label?: string) => void;
};

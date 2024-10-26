// TODO proper types
declare module 'workers-logger' {
	export type Reporter = any;
	export type LogEvent = any;
	export function track(message: any, data?: any, reporter?: Reporter): any;
	export function enable(namespace?: string): void;
	export function format(...args: any[]): string;
	// Add any other functions or types that you use from this module
}

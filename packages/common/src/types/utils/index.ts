import * as z from 'zod/v4';

export type Assert<T extends true> = T;
export type IsExactly<T, U> = (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2 ? true : false;
export type IsZodExactly<Z extends z.ZodType, U> =
	(<G>() => G extends z.infer<Z> ? 1 : 2) extends <G>() => G extends U ? 1 : 2 ? true : false;

export type ZodObjectShape<T extends object> = {
	[K in keyof T]: z.ZodType<T[K]>;
};

export type String0x = `0x${string}`;
export const String0xSchema = z
	.string()
	.regex(/^0x[a-f0-9]+$/)
	.transform((val) => val.toLowerCase() as String0x)
	.and(z.custom<String0x>());

export type IntegerString = string;
export const IntegerStringSchema = z
	.string()
	.regex(/[0-9]+/)
	.and(z.custom<IntegerString>());

type ZodMatchString0x = Assert<IsZodExactly<typeof String0xSchema, String0x>>;
type ZodMatchIntegerString = Assert<IsZodExactly<typeof IntegerStringSchema, IntegerString>>;

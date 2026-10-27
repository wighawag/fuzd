import {z} from 'zod';
import {schemaFor} from 'zod-schema-for';
import type {IntegerString, String0x} from '@fuzd/common';

export {schemaFor};

/**
 * The canonical TypeScript types (fuzd-common, fuzd-scheduler, fuzd-chain-protocol) are the source of
 * truth; every schema here is pinned to them with `schemaFor` (exact identity, not assignability).
 *
 * `Plain<T>` only removes what exact identity cannot see through but that has no runtime meaning:
 * intersections (`A & B` vs the equivalent flat object, a known false alarm of the identity check)
 * and `readonly` modifiers (Zod output is always mutable). It recurses so nested intersections are
 * flattened too, distributes over unions, and leaves `any` untouched.
 */
export type Plain<T> = 0 extends 1 & T ? T : T extends object ? {-readonly [K in keyof T]: Plain<T[K]>} : T;

/**
 * Any `0x`-prefixed hex string, in any case. Normalised to lowercase, the single canonical form fuzd
 * stores and compares (docs/adr/0003). `overwrite` keeps the type unchanged and stays representable
 * in JSON Schema, so the same schema serves requests, responses and the OpenAPI document.
 */
export const String0xSchema = schemaFor<String0x>()(
	z.templateLiteral(['0x', z.string().regex(/^[0-9a-fA-F]*$/)]).overwrite((v) => v.toLowerCase() as String0x),
);

/** A decimal integer without leading zero, as typia enforced it before. */
export const IntegerStringSchema = schemaFor<IntegerString>()(z.string().regex(/^[1-9][0-9]*$/));

/** A non-negative integer carried in a path parameter (string on the wire, number in the handler). */
export const IndexParamSchema = schemaFor<string, number>()(
	z
		.string()
		.regex(/^(0|[1-9][0-9]*)$/)
		.transform((v) => Number(v)),
);

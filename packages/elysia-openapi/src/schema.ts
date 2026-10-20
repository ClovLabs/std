import type { AnySchema } from 'elysia';
import { Intersect, IsIntersect, IsKind, IsObject, IsRef, IsUnion, Union } from 'typebox';

import type { SchemaObject } from './openapi-types-3.2';

export type Models = Record<string, AnySchema>;

/** A hook schema, or the name of a model (`body: 'User'`). */
export type HookSchema = AnySchema | string;

/** Named properties a schema accepts, see {@link objectShapeOf}. */
export interface ObjectShape {
	readonly properties: Readonly<Record<string, unknown>>;
	readonly required: ReadonlySet<string>;
}

/** Types Elysia sends as text. */
const TEXT_TYPES: ReadonlySet<unknown> = new Set(['string', 'number', 'integer', 'boolean']);

/** JSON Pointer to a component schema, escaped per RFC 6901. */
const componentRef = (name: string): string =>
	`#/components/schemas/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;

export const uniqueSchemas = <T>(schemas: readonly T[]): T[] =>
	schemas.filter(
		(schema, index) => schemas.findIndex((other) => Bun.deepEquals(other, schema)) === index
	);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** `anyOf` of `{ const }` branches (a union of literals) as an `enum`. */
const toEnum = (schema: Record<string, unknown>): Record<string, unknown> => {
	const { anyOf, ...rest } = schema;
	if (
		!Array.isArray(anyOf) ||
		anyOf.length === 0 ||
		!anyOf.every(
			(branch) =>
				isPlainObject(branch) &&
				'const' in branch &&
				Object.keys(branch).every((key) => key === 'const' || key === 'type')
		)
	)
		return schema;

	const branches = anyOf as Record<string, unknown>[];
	const types = new Set(branches.map((branch) => branch.type));
	const [type] = types;
	return {
		...rest,
		...(types.size === 1 && type !== undefined && { type }),
		enum: branches.map((branch) => branch.const)
	};
};

/**
 * Converts a TypeBox schema to a plain JSON Schema 2020-12, without mutating it.
 *
 * TypeBox schemas already are JSON Schema, only Elysia's custom kinds and model references need rewriting.
 */
export const toSchema = (node: unknown): unknown => {
	// `t.MaybeEmpty` adds a `{ type: 'undefined' }` branch, which is not JSON Schema
	if (Array.isArray(node))
		return node
			.filter((item) => (item as { readonly type?: unknown } | null)?.type !== 'undefined')
			.map(toSchema);
	if (!isPlainObject(node)) return node;

	if (['File', 'ArrayBuffer', 'Uint8Array'].some((kind) => IsKind(node, kind)))
		return { contentMediaType: 'application/octet-stream' };
	if (IsKind(node, 'Date')) return { type: 'string', format: 'date-time' };
	// nothing to describe: the multipart envelope, or values JSON never carries
	if (IsKind(node, 'FormData') || IsKind(node, 'Void') || IsKind(node, 'Undefined')) return {};
	// JSON has no bigint, Elysia reads it from an integer
	if (IsKind(node, 'BigInt')) return { type: 'integer' };

	const schema: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		// `~` keys are Elysia internals, `nullable` is OpenAPI 3.0 only, `headers` belongs to the Response Object
		// (`withHeaders`), `$id` would rebase every `$ref` inside the component
		if (key.startsWith('~') || key === 'nullable' || key === 'headers' || key === '$id')
			continue;

		// a `$ref` that is neither a pointer nor a URI names a model (`t.Ref('User')`)
		if (
			key === '$ref' &&
			typeof value === 'string' &&
			!value.startsWith('#') &&
			!value.includes(':')
		)
			schema[key] = componentRef(value);
		// keywords whose keys are names, not keywords, and whose values are schemas
		else if (
			['properties', 'patternProperties', '$defs', 'dependentSchemas'].includes(key) &&
			isPlainObject(value)
		)
			schema[key] = Object.fromEntries(
				Object.entries(value).map(([name, sub]) => [name, toSchema(sub)])
			);
		// values, not schemas
		else if (
			['const', 'enum', 'default', 'example', 'examples'].includes(key) ||
			key.startsWith('x-')
		)
			schema[key] = value;
		else schema[key] = toSchema(value);
	}

	// a bare OpenAPI 3.0 `nullable`, Elysia's `t.Nullable` already has a `null` branch
	if (node.nullable === true && !('anyOf' in node))
		return { anyOf: [toEnum(schema), { type: 'null' }] };
	return toEnum(schema);
};

/**
 * Attaches response headers to a response schema, documented as the response's `headers`.
 *
 * Elysia does not validate response headers, this is documentation only.
 *
 * @param schema - The response body schema
 * @param headers - An object schema of the headers
 *
 * @returns A copy of `schema` carrying `headers`
 */
export const withHeaders = <const Schema extends AnySchema>(
	schema: Schema,
	headers: AnySchema
): Schema =>
	// copies the descriptors, Elysia's kind marker is not enumerable and the schema is frozen
	Object.defineProperty(
		Object.create(
			Object.getPrototypeOf(schema) as object | null,
			Object.getOwnPropertyDescriptors(schema)
		),
		'headers',
		{ value: headers, enumerable: true }
	) as Schema;

// `unknown`: TypeBox's own `TSchema` and the one Elysia bundles are distinct types
export const toRootSchema = (node: unknown): SchemaObject =>
	(typeof node === 'string' ? { $ref: componentRef(node) } : toSchema(node)) as SchemaObject;

/** The schema behind a model name (`'User'`) or a `t.Ref('User')`. */
export const resolveModel = (node: unknown, models: Models): AnySchema | undefined => {
	if (typeof node === 'string') return models[node];
	if (IsRef(node)) return models[node.$ref];
	return node as AnySchema | undefined;
};

/** The JSON Schema `type` keyword, whatever the TypeBox kind (`t.Literal('a')` is a `string`). */
export const jsonTypeOf = (node: AnySchema | undefined): unknown =>
	node && 'type' in node ? node.type : undefined;

export const descriptionOf = (node: AnySchema | undefined): string | undefined =>
	node && 'description' in node && typeof node.description === 'string'
		? node.description
		: undefined;

export const hasDefault = (node: AnySchema | undefined): boolean =>
	node !== undefined && 'default' in node;

/** Whether Elysia sends every value of the schema as text (strings, numbers, booleans). */
export const isText = (node: unknown, models: Models): boolean => {
	const schema = resolveModel(node, models);
	return IsUnion(schema)
		? schema.anyOf.every((branch) => isText(branch, models))
		: TEXT_TYPES.has(jsonTypeOf(schema));
};

/** Whether every value of the schema is a JSON primitive or `null`. */
export const isPrimitive = (node: unknown, models: Models): boolean => {
	const schema = resolveModel(node, models);
	return IsUnion(schema)
		? schema.anyOf.every((branch) => isPrimitive(branch, models))
		: jsonTypeOf(schema) === 'null' || TEXT_TYPES.has(jsonTypeOf(schema));
};

/** `t.ArrayBuffer()` and `t.Uint8Array()`, read by Elysia from an `application/octet-stream` body. */
export const isRawBinary = (node: unknown): boolean =>
	IsKind(node, 'ArrayBuffer') || IsKind(node, 'Uint8Array');

export const isFile = (node: unknown): boolean => IsKind(node, 'File');

export const containsFile = (node: unknown, models: Models, seen = new Set<unknown>()): boolean => {
	const schema = IsRef(node) ? models[node.$ref] : node;
	// arrays included: `t.Files()` is an `anyOf` holding the file
	if (typeof schema !== 'object' || schema === null || seen.has(schema)) return false;
	seen.add(schema);
	return (
		isFile(schema) || Object.values(schema).some((value) => containsFile(value, models, seen))
	);
};

/**
 * The named properties a schema accepts: an object, a model (`'Page'`, `t.Ref('Page')`), or a union or intersection
 * of them.
 *
 * A union's property is required when every branch requires it, an intersection's when any does.
 */
export const objectShapeOf = (node: unknown, models: Models): ObjectShape | undefined => {
	const schema = resolveModel(node, models);
	if (IsObject(schema))
		return {
			properties: schema.properties,
			// TypeBox omits `required` when no property is required, its type does not
			required: new Set(schema.required as readonly string[] | undefined)
		};

	const isUnion = IsUnion(schema);
	const branches = isUnion ? schema.anyOf : IsIntersect(schema) ? schema.allOf : [];
	const shapes = branches
		.map((branch) => objectShapeOf(branch, models))
		.filter((shape) => shape !== undefined);
	if (shapes.length === 0) return undefined;

	const required = shapes.flatMap((shape) => [...shape.required]);
	const names = new Set(shapes.flatMap((shape) => Object.keys(shape.properties)));
	return {
		// a property in several branches accepts any of their schemas in a union, all of them in an intersection
		properties: Object.fromEntries(
			[...names].map((name) => {
				const schemas = uniqueSchemas(
					shapes
						.map((shape) => shape.properties[name])
						.filter((property) => property !== undefined)
				) as AnySchema[];
				if (schemas.length === 1) return [name, schemas[0]];
				return [name, isUnion ? Union(schemas) : Intersect(schemas)];
			})
		),
		required: new Set(
			isUnion
				? required.filter((name) => shapes.every((shape) => shape.required.has(name)))
				: required
		)
	};
};

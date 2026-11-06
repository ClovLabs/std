import type { AnySchema } from 'elysia';
import { Intersect, IsArray, IsIntersect, IsKind, IsObject, IsRef, IsUnion, Union } from 'typebox';

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

/** Options of `t.File` and `t.Files`, sizes in bytes. */
interface FileOptions {
	types?: string[];
	minSize?: number;
	maxSize?: number;
	minItems?: number;
	maxItems?: number;
}

/** Elysia's `FileUnit`: `'600k'`, `'3m'` or a number of bytes. */
const parseFileUnit = (size: string): number => {
	const unit = { k: 1024, m: 1024 * 1024 }[size.slice(-1)];
	return unit === undefined ? Number(size) : Number(size.slice(0, -1)) * unit;
};

/**
 * The options of a `t.File`, or of a `t.Files` for its items count.
 *
 * Elysia keeps them only in its validation closures, they are read back from the messages of `~refine`.
 */
const fileOptionsOf = (node: unknown): FileOptions => {
	const refines = (node as { readonly '~refine'?: unknown } | undefined)?.['~refine'];
	const options: FileOptions = {};
	for (const refine of Array.isArray(refines) ? (refines as unknown[]) : []) {
		const error = (refine as { readonly error?: unknown } | null)?.error;
		const message = typeof error === 'function' ? String((error as () => unknown)()) : '';
		const [, types] = /^Expect file type to be (?:one of )?(.+)$/.exec(message) ?? [];
		// Elysia accepts a bare `image` for `image/*`
		if (types)
			options.types = types
				.split(', ')
				.map((type) => (type.includes('/') ? type : `${type}/*`));
		const [, minSize] = /^Expect file size to be more than (.+)$/.exec(message) ?? [];
		if (minSize) options.minSize = parseFileUnit(minSize);
		const [, maxSize] = /^Expect file size to be less than (.+)$/.exec(message) ?? [];
		if (maxSize) options.maxSize = parseFileUnit(maxSize);
		const [, minItems] = /^Expect at least (\d+) files$/.exec(message) ?? [];
		if (minItems) options.minItems = Number(minItems);
		const [, maxItems] = /^Expect less than (\d+) files$/.exec(message) ?? [];
		if (maxItems) options.maxItems = Number(maxItems);
	}
	return options;
};

/** The annotations Elysia keeps on its own kinds. */
const metaOf = (node: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(node).filter(([key]) =>
			['title', 'description', 'examples', 'default'].includes(key)
		)
	);

/** `t.ArrayBuffer()` and `t.Uint8Array()`, read by Elysia from an `application/octet-stream` body. */
export const isRawBinary = (node: unknown): boolean =>
	IsKind(node, 'ArrayBuffer') || IsKind(node, 'Uint8Array');

export const isFile = (node: unknown): boolean => IsKind(node, 'File');

/** The file of a `t.Files()`, an `anyOf` of an array of files and a single one. */
const filesItemOf = (node: unknown): Record<string, unknown> | undefined => {
	if (!IsUnion(node) || node.anyOf.length !== 2) return undefined;
	const [array, file] = node.anyOf;
	return IsArray(array) && isFile(array.items) && isFile(file)
		? (file as Record<string, unknown>)
		: undefined;
};

/** A `t.File`, a `t.Files`, or a union holding one at any depth. */
const holdsFile = (node: unknown): boolean =>
	isFile(node) ||
	filesItemOf(node) !== undefined ||
	(IsUnion(node) && node.anyOf.some(holdsFile));

/**
 * The media types a part is sent with: a file's own types, otherwise the defaults of the Encoding Object's
 * `contentType` (OAS 3.2 4.15.1.1), `application/octet-stream` for a file without types.
 */
const partMediaTypesOf = (node: unknown): string[] => {
	if (isFile(node)) return fileOptionsOf(node).types ?? ['application/octet-stream'];
	const file = filesItemOf(node);
	if (file) return partMediaTypesOf(file);
	if (IsUnion(node)) return [...new Set(node.anyOf.flatMap(partMediaTypesOf))];

	const { type } = node as { readonly type?: unknown };
	// a `null` is omitted, its media type is irrelevant
	if (type === 'null') return [];
	if (type === 'object' || type === 'array') return ['application/json'];
	return type === undefined ? ['application/octet-stream'] : ['text/plain'];
};

/**
 * The `contentType` of a part holding a `t.File` or `t.Files`, as a list of media types.
 *
 * @returns `undefined` when the part holds no file, or is sent with the default `application/octet-stream` of a
 * schema without `type`
 */
export const fileMediaTypesOf = (node: unknown): string[] | undefined => {
	if (!holdsFile(node)) return undefined;
	const mediaTypes = partMediaTypesOf(node);
	return mediaTypes.length === 1 && mediaTypes[0] === 'application/octet-stream'
		? undefined
		: mediaTypes;
};

/** `maxLength` bounds unencoded binary in bytes (OAS 3.2 4.14.3.2). */
const toFileSchema = (node: Record<string, unknown>): Record<string, unknown> => {
	const { minSize, maxSize } = fileOptionsOf(node);
	return {
		...metaOf(node),
		...(minSize !== undefined && { minLength: minSize }),
		...(maxSize !== undefined && { maxLength: maxSize })
	};
};

/**
 * Elysia's and TypeBox's kinds that are not JSON Schema.
 *
 * @returns `undefined` when `node` is plain JSON Schema
 */
const toKindSchema = (node: Record<string, unknown>): Record<string, unknown> | undefined => {
	// raw binary: the media type of the body or of its multipart part says it is binary (OAS 3.2 4.24.4.3)
	if (isFile(node)) return toFileSchema(node);
	if (isRawBinary(node)) return metaOf(node);
	const file = filesItemOf(node);
	if (file) {
		const { minItems, maxItems } = fileOptionsOf(node);
		return {
			...metaOf(node),
			type: 'array',
			items: toFileSchema(file),
			...(minItems !== undefined && { minItems }),
			...(maxItems !== undefined && { maxItems })
		};
	}
	if (IsKind(node, 'Date')) return { type: 'string', format: 'date-time' };
	// nothing to describe: the multipart envelope, or values JSON never carries
	if (IsKind(node, 'FormData') || IsKind(node, 'Void') || IsKind(node, 'Undefined')) return {};
	// JSON has no bigint, Elysia reads it from an integer
	if (IsKind(node, 'BigInt')) return { type: 'integer' };
	return undefined;
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

	const kind = toKindSchema(node);
	if (kind) return kind;

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
		// TypeBox writes tuples in the draft-07 form, 2020-12 has `prefixItems` and `items` for the rest
		else if (key === 'items' && Array.isArray(value)) schema.prefixItems = toSchema(value);
		else if (key === 'additionalItems') schema.items = toSchema(value);
		// OAS 3.2 deprecates `example` for JSON Schema's `examples`
		else if (key === 'example')
			schema.examples = uniqueSchemas([
				...(Array.isArray(node.examples) ? (node.examples as unknown[]) : []),
				value
			]);
		// values, not schemas
		else if (['const', 'enum', 'default', 'examples'].includes(key) || key.startsWith('x-'))
			schema[key] ??= value;
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

/**
 * Marks a response schema as a Server-Sent Events stream, documented as `text/event-stream`.
 *
 * The schema is the one Elysia validates each event against, `{ data, event?, id?, retry? }`.
 *
 * @param schema - The schema of an event
 *
 * @returns A copy of `schema` marked as an event stream
 */
export const withSSE = <const Schema extends AnySchema>(schema: Schema): Schema =>
	// copies the descriptors, Elysia's kind marker is not enumerable and the schema is frozen
	Object.defineProperty(
		Object.create(
			Object.getPrototypeOf(schema) as object | null,
			Object.getOwnPropertyDescriptors(schema)
		),
		'~sse',
		{ value: true, enumerable: true }
	) as Schema;

export const isSSE = (node: unknown): boolean =>
	typeof node === 'object' && node !== null && '~sse' in node;

/**
 * The schema of a parsed event (OAS 3.2 4.14.4): its fields are strings, `data` JSON-encoded when it is not one,
 * except `retry`, an integer.
 *
 * @param schema - A converted event schema, or a union of them
 */
export const toEventSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
	if (Array.isArray(schema.anyOf))
		return {
			...schema,
			anyOf: schema.anyOf.map((branch) => toEventSchema(branch as Record<string, unknown>))
		};

	const { properties } = schema;
	if (!isPlainObject(properties)) return schema;
	const { data, id, retry } = properties;
	return {
		...schema,
		properties: {
			...properties,
			...(isPlainObject(data) &&
				data.type !== 'string' && {
					data: {
						type: 'string',
						contentMediaType: 'application/json',
						contentSchema: data
					}
				}),
			// Elysia accepts a number, sent as its digits: only its annotations still apply
			...(isPlainObject(id) &&
				id.type !== 'string' && {
					id: {
						...Object.fromEntries(
							Object.entries(id).filter(([key]) =>
								['title', 'description'].includes(key)
							)
						),
						type: 'string'
					}
				}),
			...(isPlainObject(retry) && { retry: { ...retry, type: 'integer' } })
		}
	};
};

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

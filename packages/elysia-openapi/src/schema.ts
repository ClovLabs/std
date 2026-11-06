import type { AnySchema } from 'elysia';
import {
	Intersect,
	IsArray,
	IsCyclic,
	IsIntersect,
	IsKind,
	IsObject,
	IsRef,
	IsUnion,
	Union
} from 'typebox';

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

/** A model name as a component key, which only takes letters, digits, `.`, `-` and `_` (OAS 3.2 4.7.1). */
export const componentName = (name: string): string => name.replaceAll(/[^a-zA-Z0-9.\-_]/g, '_');

const COMPONENT_PREFIX = '#/components/schemas/';

/** JSON Pointer to a component schema, its key needing no escaping. */
const componentRef = (name: string): string => `${COMPONENT_PREFIX}${componentName(name)}`;

export const uniqueSchemas = <T>(schemas: readonly T[]): T[] =>
	schemas.filter(
		(schema, index) => schemas.findIndex((other) => Bun.deepEquals(other, schema)) === index
	);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** `anyOf` of `{ const }` branches (a union of literals) as an `enum`. */
const toEnum = (schema: Record<string, unknown>): Record<string, unknown> => {
	const { anyOf, ...rest } = schema;
	// an empty union accepts nothing, and `anyOf` needs a branch
	if (Array.isArray(anyOf) && anyOf.length === 0) return { ...rest, not: {} };
	if (
		!Array.isArray(anyOf) ||
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
		enum: uniqueSchemas(branches.map((branch) => branch.const))
	};
};

/** Options of `t.File` and `t.Files`, sizes in bytes, also the byte lengths of `t.ArrayBuffer` and `t.Uint8Array`. */
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
		const [, minBytes] = /^Expect byte to be more than (\d+)$/.exec(message) ?? [];
		if (minBytes) options.minSize = Number(minBytes);
		const [, maxBytes] = /^Expect byte to be less than (\d+)$/.exec(message) ?? [];
		if (maxBytes) options.maxSize = Number(maxBytes);
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
	if (isFile(node) || isRawBinary(node)) return toFileSchema(node);
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

/** Keys left out of a converted schema. */
const isDroppedKeyword = (key: string, value: unknown): boolean =>
	// `~` keys are Elysia internals, `nullable` is OpenAPI 3.0 only, `headers` belongs to the Response Object
	// (`withHeaders`), `$id` would rebase every `$ref` inside the component
	key.startsWith('~') ||
	key === 'nullable' ||
	key === 'headers' ||
	key === '$id' ||
	// Elysia's custom validation message, not a description
	key === 'error' ||
	// an empty tuple: `prefixItems` needs an item, `items: false` alone describes it
	(key === 'items' && Array.isArray(value) && value.length === 0);

/** The converted `$defs` of each `t.Cyclic`, which its `$ref`s, rewritten to components, no longer reach. */
const cyclicDefs = new WeakSet<object>();

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
		if (isDroppedKeyword(key, value)) continue;

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

	if (IsCyclic(node)) cyclicDefs.add(schema.$defs as object);
	// a bare OpenAPI 3.0 `nullable`, Elysia's `t.Nullable` already has a `null` branch
	if (node.nullable === true && !('anyOf' in node))
		return { anyOf: [toEnum(schema), { type: 'null' }] };
	return toEnum(schema);
};

/** The parts of a converted schema that may hold schemas, skipping values (`const`, `enum`, `examples`…). */
const schemaChildren = (node: Record<string, unknown>): unknown[] =>
	Object.entries(node).flatMap(([key, value]) => {
		if (['const', 'enum', 'default', 'examples'].includes(key) || key.startsWith('x-'))
			return [];
		// keywords whose keys are names, not keywords
		return ['properties', 'patternProperties', '$defs', 'dependentSchemas'].includes(key) &&
			isPlainObject(value)
			? Object.values(value)
			: [value];
	});

/** Rewrites, in place, the `$ref`s named in `renames` to their new target. */
const renameRefs = (node: unknown, renames: ReadonlyMap<string, string>): void => {
	if (Array.isArray(node)) for (const item of node) renameRefs(item, renames);
	if (!isPlainObject(node)) return;
	const renamed = typeof node.$ref === 'string' ? renames.get(node.$ref) : undefined;
	if (renamed) node.$ref = renamed;
	for (const child of schemaChildren(node)) renameRefs(child, renames);
};

/**
 * Moves the `$defs` of each `t.Cyclic` converted by {@link toSchema} into `schemas`, so that its `$ref`s, rewritten to
 * components, resolve. A name taken by a different schema gets a numeric suffix, and the `t.Cyclic`'s `$ref`s
 * follow it. Any other schema, the `base` ones included, is left untouched.
 *
 * @param node - A converted schema, or any part of the document holding some
 * @param schemas - The components' schemas, completed in place
 */
export const hoistDefs = (node: unknown, schemas: Record<string, unknown>): void => {
	if (Array.isArray(node)) for (const item of node) hoistDefs(item, schemas);
	if (!isPlainObject(node)) return;
	for (const child of schemaChildren(node)) hoistDefs(child, schemas);

	const { $defs } = node;
	if (!isPlainObject($defs) || !cyclicDefs.has($defs)) return;
	delete node.$defs;
	const renames = new Map<string, string>();
	const hoisted = Object.entries($defs).map(([name, def]) => {
		const key = componentName(name);
		let candidate = key;
		for (
			let suffix = 2;
			schemas[candidate] !== undefined && !Bun.deepEquals(schemas[candidate], def);
			suffix++
		)
			candidate = `${key}${suffix}`;
		if (candidate !== key) renames.set(componentRef(name), `${COMPONENT_PREFIX}${candidate}`);
		return [candidate, def] as const;
	});
	renameRefs(node, renames);
	for (const [key, def] of hoisted) {
		renameRefs(def, renames);
		schemas[key] ??= def;
	}
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

/** An event's `data`: Elysia sends a string as is, any other value as JSON. */
const toEventData = (data: Record<string, unknown>): Record<string, unknown> => {
	if (data.type === 'string') return data;
	const toJson = (contentSchema: unknown): Record<string, unknown> => ({
		type: 'string',
		contentMediaType: 'application/json',
		contentSchema
	});
	const { anyOf, ...rest } = data;
	const branches = (Array.isArray(anyOf) ? anyOf : []) as Record<string, unknown>[];
	const texts = branches.filter((branch) => branch.type === 'string');
	if (texts.length === 0) return toJson(data);
	const values = branches.filter((branch) => branch.type !== 'string');
	return {
		...rest,
		anyOf: [...texts, toJson(values.length === 1 ? values[0] : { anyOf: values })]
	};
};

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
			...(isPlainObject(data) && { data: toEventData(data) }),
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

/** A `t.File`, a `t.Files`, or an array or a union holding one at any depth. */
const holdsFile = (node: unknown, models: Models): boolean => {
	const schema = resolveModel(node, models);
	return (
		isFile(schema) ||
		filesItemOf(schema) !== undefined ||
		(IsArray(schema) && holdsFile(schema.items, models)) ||
		(IsUnion(schema) && schema.anyOf.some((branch) => holdsFile(branch, models)))
	);
};

/**
 * The media types a part is sent with: a file's own types, otherwise the defaults of the Encoding Object's
 * `contentType` (OAS 3.2 4.15.1.1) for the converted schema, `application/octet-stream` for a file without types.
 *
 * @param isItem - Whether `node` is an item of an array part, whose arrays are sent as JSON instead of one part each
 */
const partMediaTypesOf = (node: unknown, models: Models, isItem = false): string[] => {
	const schema = resolveModel(node, models);
	if (isFile(schema)) return fileOptionsOf(schema).types ?? ['application/octet-stream'];
	const file = filesItemOf(schema);
	if (file) return partMediaTypesOf(file, models, isItem);
	if (IsUnion(schema))
		return [
			...new Set(schema.anyOf.flatMap((branch) => partMediaTypesOf(branch, models, isItem)))
		];
	// a `null` or `undefined` is omitted, its media type is irrelevant
	if (['null', 'undefined'].includes(jsonTypeOf(schema) as string)) return [];
	// an array part is sent as one part per item (OAS 3.2 4.14.5.1)
	if (IsArray(schema) && !isItem) return partMediaTypesOf(schema.items, models, true);

	// an unknown model has no type
	const { type } = (toSchema(schema) ?? {}) as { readonly type?: unknown };
	if (type === 'object' || type === 'array') return ['application/json'];
	return type === undefined ? ['application/octet-stream'] : ['text/plain'];
};

/**
 * The `contentType` of a part holding a `t.File` or `t.Files`, as a list of media types.
 *
 * @returns `undefined` when the part holds no file, or is sent with the default `application/octet-stream` of a
 * schema without `type`
 */
export const fileMediaTypesOf = (node: unknown, models: Models): string[] | undefined => {
	if (!holdsFile(node, models)) return undefined;
	const mediaTypes = partMediaTypesOf(node, models);
	return mediaTypes.length === 1 && mediaTypes[0] === 'application/octet-stream'
		? undefined
		: mediaTypes;
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

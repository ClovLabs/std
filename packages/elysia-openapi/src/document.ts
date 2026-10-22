import { StatusMapBack, type AnyElysia, type InputSchema } from 'elysia';
import type { ContentType, UnwrapArray } from 'elysia/types';
import { isRecordNumber } from 'elysia/utils';
import { IsOptional, IsUnion } from 'typebox';

import type {
	HeaderObject,
	MediaTypeObject,
	OpenAPIObject,
	OperationObject,
	ParameterLocation,
	ParameterObject,
	PathItemObject,
	PathsObject,
	ReferenceObject,
	RequestBodyObject,
	ResponseObject,
	ResponsesObject,
	SchemaObject,
	TagObject
} from './openapi-types-3.2';
import {
	containsFile,
	descriptionOf,
	hasDefault,
	type HookSchema,
	isFile,
	isPrimitive,
	isRawBinary,
	isText,
	jsonTypeOf,
	type Models,
	objectShapeOf,
	resolveModel,
	toRootSchema,
	toSchema,
	uniqueSchemas
} from './schema';

/** Elysia types `detail` with OpenAPI 3.0, this module documents 3.2. */
type Detail = Partial<OperationObject> & { readonly hide?: boolean };

type Content = Record<string, MediaTypeObject | ReferenceObject>;

/** The parts of a route's hooks (`app.routes`, guards and macros composed) this module reads. */
interface RouteHooks extends InputSchema {
	readonly parse?: unknown;
	readonly detail?: Detail;
	/** Validators checked independently of the route's own (e.g. from macros), not merged by Elysia. */
	readonly schemas?: InputSchema[];
}

interface DocumentedRoute {
	readonly method: string;
	readonly path: string;
	readonly hooks: RouteHooks;
	/** Every schema a response may match, per status. */
	readonly responses: Readonly<Record<string, readonly HookSchema[]>>;
	/** No hook at all, like the preflight routes `@elysia/cors` adds. */
	readonly bare: boolean;
}

const FIXED_METHODS = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
	'query'
] as const;

type FixedMethod = (typeof FIXED_METHODS)[number];

const isFixedMethod = (method: string): method is FixedMethod =>
	(FIXED_METHODS as readonly string[]).includes(method);

const FORM_MEDIA_TYPES = [
	'application/json',
	'application/x-www-form-urlencoded',
	'multipart/form-data'
] as const;

const isReference = (value: object): value is ReferenceObject => '$ref' in value;

const toPascalCase = (value: string): string =>
	value
		.split(/[^a-zA-Z0-9]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join('');

/** `get` + `/users/{id}/roles` -> `getUsersByIdRoles`, `/` -> `getIndex`, `/files/*` -> `getFilesAny`. */
const toOperationId = (method: string, path: string): string =>
	method +
	(path
		.split('/')
		.filter(Boolean)
		.map((segment) =>
			segment === '*'
				? 'Any'
				: segment.startsWith('{')
					? `By${toPascalCase(segment.slice(1, -1))}`
					: toPascalCase(segment)
		)
		.join('') || 'Index');

/** One schema as is, several combined under `keyword`. */
const toCombinedSchema = (schemas: readonly unknown[], keyword: 'allOf' | 'anyOf'): SchemaObject =>
	schemas.length === 1
		? toRootSchema(schemas[0])
		: { [keyword]: schemas.map((schema) => toRootSchema(schema)) };

/** Parameters for the named properties of a schema, objects, models, unions and intersections included. */
const toParameters = (
	location: ParameterLocation,
	node: HookSchema | undefined,
	models: Models
): ParameterObject[] => {
	const shape = objectShapeOf(node, models);
	if (!shape) return [];

	// the spec ignores `accept`, `content-type` and `authorization`: `content` and `security` describe them
	return Object.entries(shape.properties)
		.filter(
			([name]) =>
				location !== 'header' ||
				!['accept', 'content-type', 'authorization'].includes(name.toLowerCase())
		)
		.map(([name, property]): ParameterObject => {
			const resolved = resolveModel(property, models);
			const description = descriptionOf(resolved);
			const common = {
				name,
				in: location,
				...(description !== undefined && { description }),
				// a default makes the value optional at runtime
				required: location === 'path' || (shape.required.has(name) && !hasDefault(resolved))
			};
			const schema = toRootSchema(property);
			// Elysia reads an object query value as JSON only
			return location === 'query' && jsonTypeOf(resolved) === 'object'
				? { ...common, content: { 'application/json': { schema } } }
				: { ...common, schema };
		});
};

/**
 * The media types the body is read from: the route's `parse` if set, otherwise what Elysia's default parser
 * accepts for that schema.
 */
const toBodyMediaTypes = (
	parse: unknown,
	bodies: readonly HookSchema[],
	models: Models
): readonly string[] => {
	// Elysia only applies the first parser
	const [parser] = [parse].flat();
	if (typeof parser === 'function') return ['*/*'];
	if (typeof parser === 'string') {
		// Elysia's `parse` shorthands, a media type is read as is
		const shorthands: Readonly<Record<string, readonly string[]>> = {
			none: [...FORM_MEDIA_TYPES, 'text/plain'],
			text: ['text/plain'],
			json: ['application/json'],
			formdata: ['multipart/form-data', 'application/x-www-form-urlencoded'],
			urlencoded: ['application/x-www-form-urlencoded'],
			arrayBuffer: ['application/octet-stream']
		} satisfies Record<
			Exclude<UnwrapArray<ContentType>, `${string}/${string}`>,
			readonly string[]
		>;
		const mediaTypes = parser.includes('/') ? [parser] : shorthands[parser];
		if (mediaTypes) return mediaTypes;
	}

	const schemas = bodies.map((body) => resolveModel(body, models));
	if (schemas.some(isRawBinary)) return ['application/octet-stream'];
	if (schemas.some((schema) => containsFile(schema, models))) return ['multipart/form-data'];
	if (bodies.every((body) => isPrimitive(body, models)))
		return ['application/json', 'text/plain'];
	return FORM_MEDIA_TYPES;
};

const toRequestBody = (
	hooks: RouteHooks,
	models: Models,
	method: string
): RequestBodyObject | undefined => {
	// GET and HEAD have no defined request body (RFC 9110 9.3.1-2), TRACE forbids one (9.3.8)
	if (['get', 'head', 'trace'].includes(method)) return;

	const bodies = uniqueSchemas(
		[hooks, ...(hooks.schemas ?? [])]
			.map((layer) => layer.body)
			.filter((body) => body !== undefined)
	);
	const [first] = bodies;
	if (first === undefined) return;

	const schema = toCombinedSchema(bodies, 'allOf');
	const description = descriptionOf(resolveModel(first, models));
	return {
		...(description !== undefined && { description }),
		// optional on the hook or its model, or accepting `undefined`
		required: !bodies.every((body) => {
			const resolved = resolveModel(body, models);
			return (
				IsOptional(body) ||
				IsOptional(resolved) ||
				(IsUnion(resolved) &&
					resolved.anyOf.some(
						(branch) => jsonTypeOf(resolveModel(branch, models)) === 'undefined'
					))
			);
		}),
		content: Object.fromEntries(
			toBodyMediaTypes(hooks.parse, bodies, models).map((mediaType) => [
				mediaType,
				{ schema }
			])
		)
	};
};

/** Elysia sends binaries as is, strings, numbers and booleans as text, everything else as JSON. */
const toResponseContent = (
	schemas: readonly HookSchema[],
	models: Models,
	status: string
): Content | undefined => {
	const [first] = schemas;
	const resolved = resolveModel(first, models);
	const type = jsonTypeOf(resolved);
	// Elysia sends these without a body
	if (type === 'void' || type === 'null' || type === 'undefined') return;
	if (isRawBinary(resolved) || isFile(resolved))
		return { 'application/octet-stream': { schema: toRootSchema(first) } };

	// a single union mixing binary, text and JSON values is sent with the media type of the value
	if (schemas.length === 1 && IsUnion(resolved)) {
		const branches = Map.groupBy(resolved.anyOf, (branch) => {
			const schema = resolveModel(branch, models);
			if (isRawBinary(schema) || isFile(schema)) return 'application/octet-stream';
			return isText(branch, models) ? 'text/plain' : 'application/json';
		});
		if (branches.size > 1)
			return Object.fromEntries(
				[...branches].map(([mediaType, group]) => [
					mediaType,
					{ schema: toCombinedSchema(group, 'anyOf') }
				])
			);
	}

	// `problem()` serves an RFC 9457 document, recognised by its `type` and `status` members
	const isProblem =
		Number(status) >= 400 &&
		schemas.every((schema) => {
			const required = objectShapeOf(schema, models)?.required;
			return required?.has('type') === true && required.has('status');
		});
	const mediaType = isProblem ? 'application/problem+json' : 'application/json';
	return {
		[isText(first, models) ? 'text/plain' : mediaType]: {
			// a client gets one of them: values thrown to `onError` skip response validation
			schema: toCombinedSchema(schemas, 'anyOf')
		}
	};
};

/** Response headers declared with `withHeaders(schema, headers)`. */
const toResponseHeaders = (
	schema: HookSchema | undefined,
	models: Models
): Record<string, HeaderObject> | undefined => {
	const resolved = resolveModel(schema, models);
	const shape = objectShapeOf(
		resolved && 'headers' in resolved ? resolved.headers : undefined,
		models
	);
	if (!shape) return;

	return Object.fromEntries(
		Object.entries(shape.properties).map(([name, property]) => {
			const description = descriptionOf(resolveModel(property, models));
			return [
				name,
				{
					...(description !== undefined && { description }),
					required: shape.required.has(name),
					schema: toRootSchema(property)
				}
			];
		})
	);
};

const toResponses = (route: DocumentedRoute, models: Models): ResponsesObject =>
	Object.fromEntries(
		Object.entries(route.responses).map(([status, schemas]): [string, ResponseObject] => {
			const description =
				descriptionOf(resolveModel(schemas[0], models)) ??
				(StatusMapBack as Record<string, string | undefined>)[status];
			const headers = toResponseHeaders(schemas[0], models);
			const content = toResponseContent(schemas, models, status);
			return [
				status,
				{
					...(description !== undefined && { description }),
					...(headers && { headers }),
					...(content && { content })
				}
			];
		})
	);

/** `detail.parameters` override the generated ones with the same name and location. */
const mergeParameters = (
	generated: readonly ParameterObject[],
	overrides: readonly (ParameterObject | ReferenceObject)[] = []
): (ParameterObject | ReferenceObject)[] => {
	const parameters = new Map<string, ParameterObject | ReferenceObject>(
		generated.map((parameter) => [`${parameter.in}:${parameter.name}`, parameter])
	);
	for (const parameter of overrides)
		parameters.set(
			isReference(parameter) ? parameter.$ref : `${parameter.in}:${parameter.name}`,
			parameter
		);
	return [...parameters.values()];
};

/** `detail.responses` override the generated ones per status, field by field. */
const mergeResponses = (
	generated: ResponsesObject,
	overrides: ResponsesObject = {}
): ResponsesObject => {
	const responses: ResponsesObject = { ...generated };
	for (const [status, override] of Object.entries(overrides) as [
		keyof ResponsesObject,
		ResponseObject | ReferenceObject
	][]) {
		const response = responses[status];
		responses[status] =
			response && !isReference(response) && !isReference(override)
				? { ...response, ...override }
				: override;
	}
	return responses;
};

/** `detail.requestBody` overrides the generated one field by field, its content per media type. */
const mergeRequestBody = (
	generated: RequestBodyObject | undefined,
	override: Partial<RequestBodyObject> | ReferenceObject | undefined
): RequestBodyObject | ReferenceObject | undefined => {
	if (!override) return generated;
	if (!generated || isReference(override)) return override as RequestBodyObject | ReferenceObject;

	const content: Content = { ...generated.content };
	for (const [mediaType, media] of Object.entries(override.content ?? {})) {
		const current = content[mediaType];
		content[mediaType] =
			current && !isReference(current) && !isReference(media)
				? { ...current, ...media }
				: media;
	}
	return { ...generated, ...override, content };
};

const toOperation = (route: DocumentedRoute, models: Models, method: string): OperationObject => {
	const { hooks } = route;

	// a guard or macro parameter is validated over the route's own one with the same name
	const parameters = new Map<string, ParameterObject>();
	for (const layer of [hooks, ...(hooks.schemas ?? [])])
		for (const [location, key] of [
			['path', 'params'],
			['query', 'query'],
			['header', 'headers'],
			['cookie', 'cookie']
		] as const)
			for (const parameter of toParameters(location, layer[key], models))
				parameters.set(`${location}:${parameter.name}`, parameter);

	const {
		hide: _hide,
		parameters: parameterOverrides,
		responses: responseOverrides,
		requestBody: requestBodyOverride,
		...detail
	} = hooks.detail ?? {};
	const allParameters = mergeParameters([...parameters.values()], parameterOverrides);
	const requestBody = mergeRequestBody(toRequestBody(hooks, models, method), requestBodyOverride);
	const responses = mergeResponses(toResponses(route, models), responseOverrides);
	return {
		...(allParameters.length > 0 && { parameters: allParameters }),
		...(requestBody && { requestBody }),
		...(Object.keys(responses).length > 0 && { responses }),
		...detail
	};
};

/** `:name` anywhere in a segment (`/v-:version`) is a parameter until the segment ends. */
const toTemplate = (segment: string): string => {
	const index = segment.indexOf(':');
	return index === -1
		? segment
		: `${segment.slice(0, index)}{${segment.slice(index + 1).replace(/\?$/, '')}}`;
};

/** `/a/:id?` -> `['/a/{id}', '/a']`, Elysia only allows trailing optional params. */
const toOpenAPIPaths = (path: string): `/${string}`[] => {
	const segments = path.split('/');
	const templated = segments.map(toTemplate);
	const paths = [templated.join('/')];
	segments.forEach((segment, index) => {
		if (segment.includes(':') && segment.endsWith('?'))
			paths.push(templated.slice(0, index).join('/') || '/');
	});
	return paths as `/${string}`[];
};

const isPathParameter = (
	parameter: ParameterObject | ReferenceObject
): parameter is ParameterObject => !isReference(parameter) && parameter.in === 'path';

/** Keeps only the path parameters templated in `path`, declares the missing ones as required strings. */
const withPathParameters = (operation: OperationObject, path: string): OperationObject => {
	const names = path.match(/\{[^}]+\}/g)?.map((template) => template.slice(1, -1)) ?? [];
	const parameters = (operation.parameters ?? []).filter(
		(parameter) => !isPathParameter(parameter) || names.includes(parameter.name)
	);
	for (const name of names)
		if (!parameters.some((parameter) => isPathParameter(parameter) && parameter.name === name))
			parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });

	const { parameters: _parameters, ...rest } = operation;
	return parameters.length > 0 ? { ...rest, parameters } : rest;
};

/**
 * `a/b/c` -> tags `a`, `a/b` and `a/b/c`, each nested under its parent, empty segments skipped. Tags from `base`
 * are merged by name.
 */
const toTags = (names: Iterable<string>, base: readonly TagObject[]): TagObject[] => {
	const tags = new Map<string, TagObject>();
	for (const name of names) {
		const segments = name.split('/').filter(Boolean);
		segments.forEach((segment, index) => {
			// the leaf keeps the name operations reference
			const tagName =
				index === segments.length - 1 ? name : segments.slice(0, index + 1).join('/');
			if (!tags.has(tagName))
				tags.set(tagName, {
					name: tagName,
					...(index > 0 && {
						summary: segment,
						parent: segments.slice(0, index).join('/')
					})
				});
		});
	}
	for (const tag of base) tags.set(tag.name, { ...tags.get(tag.name), ...tag });
	return [...tags.values()];
};

/** Elysia takes a single schema as the `200` response, or a status map. */
const toStatusMap = (response: InputSchema['response']): Readonly<Record<string, HookSchema>> => {
	if (response === undefined) return {};
	return typeof response === 'object' && isRecordNumber(response)
		? (response as Record<string, HookSchema>)
		: { 200: response };
};

/**
 * `app.routes` lets a `merge` guard or macro response replace the route's own for the same status, while Elysia
 * validates both.
 */
const toResponseLayers = (
	hooks: RouteHooks,
	ownResponse: InputSchema['response']
): Record<string, readonly HookSchema[]> => {
	const own = toStatusMap(ownResponse);
	const merged = (hooks.schemas ?? []).map((layer) => toStatusMap(layer.response));

	return Object.fromEntries(
		Object.entries(toStatusMap(hooks.response)).map(([status, schema]) => {
			const layers = uniqueSchemas(
				[own[status], ...merged.map((layer) => layer[status])].filter(
					(layer) => layer !== undefined
				)
			);
			return [status, layers.length > 0 ? layers : [schema]];
		})
	);
};

/**
 * Reads each route with its instance `tags` and `detail` merged in, and every schema its responses may match.
 *
 * shortcut: Elysia 2 beta does not apply `new Elysia({ tags, detail })` to routes and hides `merge` responses in
 * `app.routes`, only the internal `~routes` has the owner instance and the route's own hook, drop once Elysia
 * exposes them
 */
const readRoutes = (app: AnyElysia): DocumentedRoute[] => {
	const internals = new Map(
		app['~routes'].map(([method, path, , owner, hook]) => [
			`${method} ${path}`,
			{
				config: owner['~config'],
				// `AnyLocalHook` is `any`
				ownResponse: (hook as InputSchema | undefined)?.response
			}
		])
	);

	return app.routes.map(({ method, path, hooks }) => {
		const routeHooks = (hooks as RouteHooks | undefined) ?? {};
		const { config, ownResponse } = internals.get(`${method} ${path}`) ?? {};
		// an operationId names one operation, the instance's routes cannot share it
		const { operationId: _operationId, ...instanceDetail } =
			(config?.detail as Detail | undefined) ?? {};
		const tags = [
			...new Set([
				...(config?.tags ?? []),
				...(instanceDetail.tags ?? []),
				...(routeHooks.detail?.tags ?? [])
			])
		].filter(Boolean);
		return {
			method,
			path,
			hooks: {
				...routeHooks,
				detail: {
					...instanceDetail,
					...routeHooks.detail,
					...(tags.length > 0 && { tags })
				}
			},
			responses: toResponseLayers(routeHooks, ownResponse),
			bare: hooks === undefined
		};
	});
};

/**
 * Builds the OpenAPI 3.2 document from the routes and models registered on `app`.
 *
 * @param app - The Elysia instance to document
 * @param base - Document fields to merge, generated `paths` and `components.schemas` take precedence on conflicts
 *
 * @returns The OpenAPI document
 */
export const buildDocument = (app: AnyElysia, base: Partial<OpenAPIObject> = {}): OpenAPIObject => {
	// `AnyElysia` erases the models' type
	const models = app.models as Models;
	const paths: PathsObject = {};
	const tagNames = new Set<string>();
	// each generated operation with the operationId it asks for
	const generated = new Map<OperationObject, string>();

	for (const route of readRoutes(app)) {
		const routeMethod = route.method.toLowerCase();
		// WebSocket routes have no OpenAPI equivalent
		if (route.hooks.detail?.hide || routeMethod === 'ws') continue;
		// the preflight routes `@elysia/cors` adds on `/` and `/*`
		if (routeMethod === 'options' && route.bare && /^\/(\*)?$|\/\*$/.test(route.path)) continue;

		for (const tag of route.hooks.detail?.tags ?? []) tagNames.add(tag);

		const isCatchAll = routeMethod === '*';
		// `.all()` routes answer every method
		for (const method of isCatchAll ? FIXED_METHODS : [routeMethod]) {
			const operation = toOperation(route, models, method);
			for (const path of toOpenAPIPaths(route.path)) {
				const item: PathItemObject = { ...paths[path] };
				// a method's own route answers before `.all()`
				if (isCatchAll && isFixedMethod(method) && item[method]) continue;

				const identified = withPathParameters(operation, path);
				generated.set(identified, identified.operationId ?? toOperationId(method, path));
				if (isFixedMethod(method)) item[method] = identified;
				else
					item.additionalOperations = {
						...item.additionalOperations,
						[route.method]: identified
					};
				paths[path] = item;
			}
		}
	}

	const mergedPaths: PathsObject = {
		...base.paths,
		...Object.fromEntries(
			(Object.entries(paths) as [`/${string}`, PathItemObject][]).map(([path, item]) => [
				path,
				{ ...base.paths?.[path], ...item }
			])
		)
	};

	// operationIds are unique across the document: the base ones are kept, a taken generated one gets a numeric suffix
	const operations = (Object.values(mergedPaths) as (PathItemObject | undefined)[]).flatMap(
		(item) => [
			...FIXED_METHODS.map((method) => item?.[method]),
			...Object.values(item?.additionalOperations ?? {})
		]
	);
	const operationIds = new Set(
		operations
			.filter((operation) => operation !== undefined && !generated.has(operation))
			.map((operation) => operation?.operationId)
	);
	for (const [operation, operationId] of generated) {
		// an `.all()` operation replaced by the method's own route is not in the document
		if (!operations.includes(operation)) continue;
		let candidate = operationId;
		for (let suffix = 2; operationIds.has(candidate); suffix++)
			candidate = `${operationId}${suffix}`;
		operationIds.add(candidate);
		operation.operationId = candidate;
	}

	return {
		openapi: '3.2.1',
		...base,
		info: {
			title: 'Elysia Documentation',
			description: 'API documentation for Elysia',
			version: '1.0.0',
			...base.info
		},
		paths: mergedPaths,
		tags: toTags(tagNames, base.tags ?? []),
		components: {
			...base.components,
			schemas: {
				...base.components?.schemas,
				...Object.fromEntries(
					Object.entries(models).map(([name, model]) => [
						name,
						toSchema(model) as SchemaObject
					])
				)
			}
		}
	};
};

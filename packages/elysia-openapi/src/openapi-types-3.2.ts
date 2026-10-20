/**
 * Specification Extensions, allowed on every object that "MAY be extended".
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#specification-extensions
 */
export type SpecificationExtensions = Record<`x-${string}`, unknown>;

/**
 * Root object of an OpenAPI Description.
 *
 * At least one of `components`, `paths` or `webhooks` MUST be present.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#openapi-object
 */
export interface OpenAPIObject extends SpecificationExtensions {
	openapi: `3.2.${number}`;
	$self?: string;
	info: InfoObject;
	jsonSchemaDialect?: string;
	servers?: ServerObject[];
	paths?: PathsObject;
	webhooks?: Record<string, PathItemObject>;
	components?: ComponentsObject;
	security?: SecurityRequirementObject[];
	tags?: TagObject[];
	externalDocs?: ExternalDocumentationObject;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#info-object
 */
export interface InfoObject extends SpecificationExtensions {
	title: string;
	summary?: string;
	description?: string;
	termsOfService?: string;
	contact?: ContactObject;
	license?: LicenseObject;
	version: string;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#contact-object
 */
export interface ContactObject extends SpecificationExtensions {
	name?: string;
	url?: string;
	email?: string;
}

/**
 * `identifier` and `url` are mutually exclusive.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#license-object
 */
export interface LicenseObject extends SpecificationExtensions {
	name: string;
	identifier?: string;
	url?: string;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#server-object
 */
export interface ServerObject extends SpecificationExtensions {
	url: string;
	description?: string;
	name?: string;
	variables?: Record<string, ServerVariableObject>;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#server-variable-object
 */
export interface ServerVariableObject extends SpecificationExtensions {
	enum?: [string, ...string[]];
	default: string;
	description?: string;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#components-object
 */
export interface ComponentsObject extends SpecificationExtensions {
	schemas?: Record<string, SchemaObject>;
	responses?: Record<string, ResponseObject | ReferenceObject>;
	parameters?: Record<string, ParameterObject | ReferenceObject>;
	examples?: Record<string, ExampleObject | ReferenceObject>;
	requestBodies?: Record<string, RequestBodyObject | ReferenceObject>;
	headers?: Record<string, HeaderObject | ReferenceObject>;
	securitySchemes?: Record<string, SecuritySchemeObject | ReferenceObject>;
	links?: Record<string, LinkObject | ReferenceObject>;
	callbacks?: Record<string, CallbackObject | ReferenceObject>;
	pathItems?: Record<string, PathItemObject>;
	mediaTypes?: Record<string, MediaTypeObject | ReferenceObject>;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#paths-object
 */
export type PathsObject = SpecificationExtensions & Record<`/${string}`, PathItemObject>;

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#path-item-object
 */
export interface PathItemObject extends SpecificationExtensions {
	$ref?: string;
	summary?: string;
	description?: string;
	get?: OperationObject;
	put?: OperationObject;
	post?: OperationObject;
	delete?: OperationObject;
	options?: OperationObject;
	head?: OperationObject;
	patch?: OperationObject;
	trace?: OperationObject;
	query?: OperationObject;
	/**
	 * Keys are HTTP methods with the exact capitalization to send, and MUST NOT
	 * contain any method that has a fixed field (e.g. `POST`).
	 */
	additionalOperations?: Record<string, OperationObject>;
	servers?: ServerObject[];
	parameters?: (ParameterObject | ReferenceObject)[];
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#operation-object
 */
export interface OperationObject extends SpecificationExtensions {
	tags?: string[];
	summary?: string;
	description?: string;
	externalDocs?: ExternalDocumentationObject;
	operationId?: string;
	parameters?: (ParameterObject | ReferenceObject)[];
	requestBody?: RequestBodyObject | ReferenceObject;
	responses?: ResponsesObject;
	callbacks?: Record<string, CallbackObject | ReferenceObject>;
	deprecated?: boolean;
	security?: SecurityRequirementObject[];
	servers?: ServerObject[];
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#external-documentation-object
 */
export interface ExternalDocumentationObject extends SpecificationExtensions {
	description?: string;
	url: string;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#parameter-locations
 */
export type ParameterLocation = 'query' | 'querystring' | 'header' | 'path' | 'cookie';

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#style-values
 */
export type ParameterStyle =
	| 'matrix'
	| 'label'
	| 'simple'
	| 'form'
	| 'spaceDelimited'
	| 'pipeDelimited'
	| 'deepObject'
	| 'cookie';

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#common-fixed-fields
 */
export interface ParameterObjectBase extends SpecificationExtensions {
	name: string;
	in: ParameterLocation;
	description?: string;
	/** REQUIRED and MUST be `true` when `in` is `"path"`. */
	required?: boolean;
	deprecated?: boolean;
	allowEmptyValue?: boolean;
	example?: unknown;
	examples?: Record<string, ExampleObject | ReferenceObject>;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#fixed-fields-for-use-with-schema
 */
export interface ParameterObjectWithSchema extends ParameterObjectBase {
	style?: ParameterStyle;
	explode?: boolean;
	allowReserved?: boolean;
	schema: SchemaObject;
	content?: never;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#fixed-fields-for-use-with-content
 */
export interface ParameterObjectWithContent extends ParameterObjectBase {
	/** MUST only contain one entry. */
	content: Record<string, MediaTypeObject | ReferenceObject>;
	style?: never;
	explode?: never;
	allowReserved?: never;
	schema?: never;
}

/**
 * A parameter MUST contain either `schema` or `content`, but not both.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#parameter-object
 */
export type ParameterObject = ParameterObjectWithSchema | ParameterObjectWithContent;

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#request-body-object
 */
export interface RequestBodyObject extends SpecificationExtensions {
	description?: string;
	content: Record<string, MediaTypeObject | ReferenceObject>;
	required?: boolean;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#media-type-object
 */
export interface MediaTypeObject extends SpecificationExtensions {
	schema?: SchemaObject;
	itemSchema?: SchemaObject;
	example?: unknown;
	examples?: Record<string, ExampleObject | ReferenceObject>;
	encoding?: Record<string, EncodingObject>;
	prefixEncoding?: EncodingObject[];
	itemEncoding?: EncodingObject;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#encoding-object
 */
export interface EncodingObject extends SpecificationExtensions {
	contentType?: string;
	headers?: Record<string, HeaderObject | ReferenceObject>;
	encoding?: Record<string, EncodingObject>;
	prefixEncoding?: EncodingObject[];
	itemEncoding?: EncodingObject;
	style?: ParameterStyle;
	explode?: boolean;
	allowReserved?: boolean;
}

/**
 * Keys are HTTP status codes (`"200"`) or ranges (`"2XX"`).
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#responses-object
 */
export interface ResponsesObject extends SpecificationExtensions {
	default?: ResponseObject | ReferenceObject;
	[statusCode: `${1 | 2 | 3 | 4 | 5}${string}`]: ResponseObject | ReferenceObject;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#response-object
 */
export interface ResponseObject extends SpecificationExtensions {
	summary?: string;
	description?: string;
	headers?: Record<string, HeaderObject | ReferenceObject>;
	content?: Record<string, MediaTypeObject | ReferenceObject>;
	links?: Record<string, LinkObject | ReferenceObject>;
}

/**
 * Keys are runtime expressions.
 *
 * shortcut: `x-` extensions are not typed, TS cannot exclude them from a `string` index signature
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#callback-object
 */
export type CallbackObject = Record<string, PathItemObject>;

/**
 * `dataValue` and `value` are mutually exclusive, as are `serializedValue`, `externalValue` and `value`.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#example-object
 */
export interface ExampleObject extends SpecificationExtensions {
	summary?: string;
	description?: string;
	dataValue?: unknown;
	serializedValue?: string;
	externalValue?: string;
	/** Deprecated for non-JSON serialization targets, use `dataValue` or `serializedValue` instead. */
	value?: unknown;
}

/**
 * `operationRef` and `operationId` are mutually exclusive.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#link-object
 */
export interface LinkObject extends SpecificationExtensions {
	operationRef?: string;
	operationId?: string;
	parameters?: Record<string, unknown>;
	requestBody?: unknown;
	description?: string;
	server?: ServerObject;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#common-fixed-fields-1
 */
export interface HeaderObjectBase extends SpecificationExtensions {
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	example?: unknown;
	examples?: Record<string, ExampleObject | ReferenceObject>;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#fixed-fields-for-use-with-schema-0
 */
export interface HeaderObjectWithSchema extends HeaderObjectBase {
	style?: 'simple';
	explode?: boolean;
	schema: SchemaObject;
	content?: never;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#fixed-fields-for-use-with-content-0
 */
export interface HeaderObjectWithContent extends HeaderObjectBase {
	/** MUST only contain one entry. */
	content: Record<string, MediaTypeObject | ReferenceObject>;
	style?: never;
	explode?: never;
	schema?: never;
}

/**
 * A header MUST contain either `schema` or `content`, but not both.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#header-object
 */
export type HeaderObject = HeaderObjectWithSchema | HeaderObjectWithContent;

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#tag-object
 */
export interface TagObject extends SpecificationExtensions {
	name: string;
	summary?: string;
	description?: string;
	externalDocs?: ExternalDocumentationObject;
	parent?: string;
	kind?: string;
}

/**
 * This object cannot be extended with additional properties.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#reference-object
 */
export interface ReferenceObject {
	$ref: string;
	summary?: string;
	description?: string;
}

/**
 * @see https://json-schema.org/draft/2020-12/json-schema-validation#section-6.1.1
 */
export type JsonSchemaType =
	| 'null'
	| 'boolean'
	| 'object'
	| 'array'
	| 'number'
	| 'string'
	| 'integer';

/**
 * JSON Schema Draft 2020-12 keywords plus the OpenAPI fixed fields.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#schema-object
 * @see https://json-schema.org/draft/2020-12/json-schema-core
 * @see https://json-schema.org/draft/2020-12/json-schema-validation
 */
export interface SchemaObjectDefinition extends SpecificationExtensions {
	// Core
	$schema?: string;
	$id?: string;
	$ref?: string;
	$anchor?: string;
	$dynamicRef?: string;
	$dynamicAnchor?: string;
	$vocabulary?: Record<string, boolean>;
	$comment?: string;
	$defs?: Record<string, SchemaObject>;

	// Applicator
	allOf?: SchemaObject[];
	anyOf?: SchemaObject[];
	oneOf?: SchemaObject[];
	not?: SchemaObject;
	if?: SchemaObject;
	then?: SchemaObject;
	else?: SchemaObject;
	dependentSchemas?: Record<string, SchemaObject>;
	prefixItems?: SchemaObject[];
	items?: SchemaObject;
	contains?: SchemaObject;
	properties?: Record<string, SchemaObject>;
	patternProperties?: Record<string, SchemaObject>;
	additionalProperties?: SchemaObject;
	propertyNames?: SchemaObject;

	// Unevaluated
	unevaluatedItems?: SchemaObject;
	unevaluatedProperties?: SchemaObject;

	// Validation
	type?: JsonSchemaType | JsonSchemaType[];
	enum?: unknown[];
	const?: unknown;
	multipleOf?: number;
	maximum?: number;
	exclusiveMaximum?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maxLength?: number;
	minLength?: number;
	pattern?: string;
	maxItems?: number;
	minItems?: number;
	uniqueItems?: boolean;
	maxContains?: number;
	minContains?: number;
	maxProperties?: number;
	minProperties?: number;
	required?: string[];
	dependentRequired?: Record<string, string[]>;

	// Meta-data
	title?: string;
	description?: string;
	default?: unknown;
	deprecated?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
	examples?: unknown[];

	// Format
	format?: string;

	// Content
	contentEncoding?: string;
	contentMediaType?: string;
	contentSchema?: SchemaObject;

	// OpenAPI fixed fields
	discriminator?: DiscriminatorObject;
	xml?: XMLObject;
	externalDocs?: ExternalDocumentationObject;
	/** @deprecated Use the JSON Schema `examples` keyword instead. */
	example?: unknown;
}

/**
 * A JSON Schema 2020-12 schema, which may also be a boolean.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#schema-object
 */
export type SchemaObject = SchemaObjectDefinition | boolean;

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#discriminator-object
 */
export interface DiscriminatorObject extends SpecificationExtensions {
	propertyName: string;
	mapping?: Record<string, string>;
	defaultMapping?: string;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#xml-node-types
 */
export type XMLNodeType = 'element' | 'attribute' | 'text' | 'cdata' | 'none';

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#xml-object
 */
export interface XMLObject extends SpecificationExtensions {
	nodeType?: XMLNodeType;
	name?: string;
	namespace?: string;
	prefix?: string;
	/** @deprecated Use `nodeType: "attribute"` instead. */
	attribute?: boolean;
	/** @deprecated Use `nodeType: "element"` instead. */
	wrapped?: boolean;
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#security-scheme-object
 */
export interface SecuritySchemeObjectBase extends SpecificationExtensions {
	description?: string;
	deprecated?: boolean;
}

export interface ApiKeySecuritySchemeObject extends SecuritySchemeObjectBase {
	type: 'apiKey';
	name: string;
	in: 'query' | 'header' | 'cookie';
}

export interface HttpSecuritySchemeObject extends SecuritySchemeObjectBase {
	type: 'http';
	scheme: string;
	/** Only applies when `scheme` is `"bearer"`. */
	bearerFormat?: string;
}

export interface MutualTLSSecuritySchemeObject extends SecuritySchemeObjectBase {
	type: 'mutualTLS';
}

export interface OAuth2SecuritySchemeObject extends SecuritySchemeObjectBase {
	type: 'oauth2';
	flows: OAuthFlowsObject;
	oauth2MetadataUrl?: string;
}

export interface OpenIdConnectSecuritySchemeObject extends SecuritySchemeObjectBase {
	type: 'openIdConnect';
	openIdConnectUrl: string;
}

export type SecuritySchemeObject =
	| ApiKeySecuritySchemeObject
	| HttpSecuritySchemeObject
	| MutualTLSSecuritySchemeObject
	| OAuth2SecuritySchemeObject
	| OpenIdConnectSecuritySchemeObject;

/**
 * Each flow requires its own subset of URL fields, see {@link OAuthFlowObject}.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#oauth-flows-object
 */
export interface OAuthFlowsObject extends SpecificationExtensions {
	implicit?: OAuthFlowObject & { authorizationUrl: string };
	password?: OAuthFlowObject & { tokenUrl: string };
	clientCredentials?: OAuthFlowObject & { tokenUrl: string };
	authorizationCode?: OAuthFlowObject & { authorizationUrl: string; tokenUrl: string };
	deviceAuthorization?: OAuthFlowObject & { deviceAuthorizationUrl: string; tokenUrl: string };
}

/**
 * @see https://spec.openapis.org/oas/v3.2.1.html#oauth-flow-object
 */
export interface OAuthFlowObject extends SpecificationExtensions {
	authorizationUrl?: string;
	deviceAuthorizationUrl?: string;
	tokenUrl?: string;
	refreshUrl?: string;
	scopes: Record<string, string>;
}

/**
 * Keys are security scheme names (or URIs), values are required scopes or roles.
 *
 * @see https://spec.openapis.org/oas/v3.2.1.html#security-requirement-object
 */
export type SecurityRequirementObject = Record<string, string[]>;

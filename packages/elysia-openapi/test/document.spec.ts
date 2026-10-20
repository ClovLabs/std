import { describe, expect, test } from 'bun:test';
import { Elysia, t, type AnyElysia } from 'elysia';

import { buildDocument } from '#/document';
import { openapiPlugin, withHeaders } from '#/index';
import type {
	OpenAPIObject,
	OperationObject,
	PathItemObject,
	RequestBodyObject,
	ReferenceObject,
	ResponseObject
} from '#/index';

describe.concurrent('buildDocument', () => {
	test('should document params, query, guard headers and responses', () => {
		const app = new Elysia().guard({ headers: t.Object({ token: t.String() }) }, (guard) =>
			guard.get(
				'/users/:id',
				{
					params: t.Object({ id: t.Numeric() }),
					query: t.Object({ expand: t.Optional(t.String({ description: 'Relations' })) }),
					response: {
						200: t.Object({ id: t.Number() }),
						404: t.String(),
						409: t.Literal('taken')
					},
					detail: { summary: 'Get a user', tags: ['user'] }
				},
				() => ({ id: 1 })
			)
		);

		expect(buildDocument(app).paths?.['/users/{id}']).toEqual({
			get: {
				operationId: 'getUsersById',
				summary: 'Get a user',
				tags: ['user'],
				parameters: [
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: { anyOf: [{ type: 'number' }, { type: 'string' }] }
					},
					{
						name: 'expand',
						in: 'query',
						description: 'Relations',
						required: false,
						schema: { type: 'string', description: 'Relations' }
					},
					{ name: 'token', in: 'header', required: true, schema: { type: 'string' } }
				],
				responses: {
					200: {
						description: 'OK',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { id: { type: 'number' } },
									required: ['id']
								}
							}
						}
					},
					404: {
						description: 'Not Found',
						content: { 'text/plain': { schema: { type: 'string' } } }
					},
					409: {
						description: 'Conflict',
						content: { 'text/plain': { schema: { type: 'string', const: 'taken' } } }
					}
				}
			}
		});
	});

	test('should skip hidden, websocket and OPTIONS routes', () => {
		const app = new Elysia()
			.get('/hidden', { detail: { hide: true } }, () => 1)
			.options('/*', () => 1)
			.ws('/ws', { message: () => undefined })
			.get('/visible', () => 1);

		expect(Object.keys(buildDocument(app).paths ?? {})).toEqual(['/visible']);
		expect(Object.keys(buildDocument(app).paths?.['/visible'] ?? {})).toEqual(['get']);
	});

	test('should document catch-all routes under every standard method', () => {
		const app = new Elysia().all('/any', () => 1);
		const item = buildDocument(app).paths?.['/any'];

		expect(Object.keys(item ?? {})).toEqual([
			'get',
			'put',
			'post',
			'delete',
			'options',
			'head',
			'patch',
			'trace',
			'query'
		]);
		expect(item?.post?.operationId).toBe('postAny');
	});

	test('should generate unique operation ids and keep explicit ones', () => {
		const app = new Elysia()
			.get('/', () => 1)
			.get('/weight-and-balance/:idWB/stations/:id?', () => 1)
			.get('/custom', { detail: { operationId: 'listCustom' } }, () => 1);
		const { paths } = buildDocument(app);

		expect(paths?.['/']?.get?.operationId).toBe('getIndex');
		expect(paths?.['/weight-and-balance/{idWB}/stations/{id}']?.get?.operationId).toBe(
			'getWeightAndBalanceByIdWBStationsById'
		);
		expect(paths?.['/weight-and-balance/{idWB}/stations']?.get?.operationId).toBe(
			'getWeightAndBalanceByIdWBStations'
		);
		expect(paths?.['/custom']?.get?.operationId).toBe('listCustom');
	});

	test('should expand optional params and declare undeclared path params', () => {
		const app = new Elysia().get('/files/:folder/:name?', () => 1);
		const { paths } = buildDocument(app);

		expect(paths?.['/files/{folder}/{name}']?.get?.parameters).toEqual([
			{ name: 'folder', in: 'path', required: true, schema: { type: 'string' } },
			{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }
		]);
		expect(paths?.['/files/{folder}']?.get?.parameters).toEqual([
			{ name: 'folder', in: 'path', required: true, schema: { type: 'string' } }
		]);
	});

	test('should reference models and strip their $id', () => {
		const app = new Elysia()
			.model({ User: t.Object({ id: t.Number(), friend: t.Optional(t.Ref('User')) }) })
			.post('/users', { body: 'User', response: 'User' }, () => ({ id: 1 }));
		const document = buildDocument(app);

		const schema = { $ref: '#/components/schemas/User' };
		expect(document.paths?.['/users']?.post?.requestBody).toEqual({
			required: true,
			content: {
				'application/json': { schema },
				'application/x-www-form-urlencoded': { schema },
				'multipart/form-data': { schema }
			}
		});
		expect(document.components?.schemas?.User).toEqual({
			type: 'object',
			properties: { id: { type: 'number' }, friend: { $ref: '#/components/schemas/User' } },
			required: ['id']
		});
	});

	test('should resolve model references everywhere', () => {
		const app = new Elysia()
			.model({
				Page: t.Object({ page: t.Number(), size: t.Optional(t.Number()) }),
				IdUser: t.Object({ idUser: t.String() }),
				Role: t.Object({ name: t.String() }),
				User: t.Object({ id: t.String(), roles: t.Array(t.Ref('Role')) })
			})
			.post(
				'/users/:idUser',
				{
					params: 'IdUser',
					query: 'Page',
					body: t.Object({ user: t.Ref('User') }),
					response: { 200: 'User', 404: t.Ref('Role') }
				},
				() => ({ id: 'a', roles: [] })
			);
		const document = buildDocument(app);
		const operation = document.paths?.['/users/{idUser}']?.post;

		expect(
			operation?.parameters?.map((parameter) =>
				'in' in parameter ? [parameter.in, parameter.name, parameter.required] : parameter
			)
		).toEqual([
			['path', 'idUser', true],
			['query', 'page', true],
			['query', 'size', false]
		]);
		expect(
			(operation?.requestBody as RequestBodyObject | undefined)?.content['application/json']
		).toEqual({
			schema: {
				type: 'object',
				properties: { user: { $ref: '#/components/schemas/User' } },
				required: ['user']
			}
		});
		expect(operation?.responses?.['200']).toEqual({
			description: 'OK',
			content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
		});
		expect(operation?.responses?.['404']).toEqual({
			description: 'Not Found',
			content: { 'application/json': { schema: { $ref: '#/components/schemas/Role' } } }
		});
		expect(document.components?.schemas?.User).toEqual({
			type: 'object',
			properties: {
				id: { type: 'string' },
				roles: { type: 'array', items: { $ref: '#/components/schemas/Role' } }
			},
			required: ['id', 'roles']
		});

		const references = JSON.stringify(document).match(/#\/components\/schemas\/\w+/g) ?? [];
		for (const reference of references)
			expect(document.components?.schemas).toHaveProperty(reference.split('/').at(-1) ?? '');
	});

	describe('guard combined with a route', () => {
		const models = {
			IdUser: t.Object({ idUser: t.String() }),
			IdRole: t.Object({ idRole: t.String() }),
			Page: t.Object({ page: t.Number() }),
			Search: t.Object({ q: t.String() }),
			User: t.Object({ id: t.String() }),
			Role: t.Object({ name: t.String() }),
			Other: t.Object({ code: t.Number() }),
			Err: t.Object({ message: t.String() })
		};
		const guardHook = {
			params: 'IdUser',
			query: 'Page',
			body: 'Role',
			response: { 200: 'Other', 401: 'Err' }
		} as const;
		const routeHook = {
			params: 'IdRole',
			query: 'Search',
			body: 'User',
			response: { 200: 'User' }
		} as const;
		const operations = {
			default: new Elysia()
				.model(models)
				.guard(guardHook, (guard) =>
					guard.post('/users/:idUser/roles/:idRole', routeHook, () => ({ id: 'a' }))
				),
			override: new Elysia()
				.model(models)
				.guard({ ...guardHook, schema: 'override' }, (guard) =>
					guard.post('/users/:idUser/roles/:idRole', routeHook, () => ({ id: 'a' }))
				),
			merge: new Elysia().model(models).guard({ ...guardHook, schema: 'merge' }, (guard) =>
				guard.post('/users/:idUser/roles/:idRole', routeHook, () => ({
					id: 'a',
					code: 1
				}))
			)
		};
		const operationOf = (mode: keyof typeof operations): OperationObject | undefined =>
			buildDocument(operations[mode]).paths?.['/users/{idUser}/roles/{idRole}']?.post;
		const ref = (name: string): { $ref: string } => ({ $ref: `#/components/schemas/${name}` });
		const schemaOf = (
			body: RequestBodyObject | ResponseObject | ReferenceObject | undefined
		): unknown => {
			const media = body && 'content' in body ? body.content['application/json'] : undefined;
			return media && 'schema' in media ? media.schema : undefined;
		};
		const namesOf = (operation: OperationObject | undefined): string[] =>
			(operation?.parameters ?? []).map((parameter) =>
				'in' in parameter ? `${parameter.in}:${parameter.name}` : parameter.$ref
			);

		for (const mode of ['default', 'override'] as const)
			test(`should let the route override the guard (${mode})`, () => {
				const operation = operationOf(mode);

				// `idUser` is not validated anymore, it is only declared because it is in the path
				expect(namesOf(operation)).toEqual(['path:idRole', 'query:q', 'path:idUser']);
				expect(schemaOf(operation?.requestBody)).toEqual(ref('User'));
				expect(schemaOf(operation?.responses?.['200'])).toEqual(ref('User'));
				expect(schemaOf(operation?.responses?.['401'])).toEqual(ref('Err'));
			});

		test('should combine the route and a merge guard', () => {
			const operation = operationOf('merge');

			expect(namesOf(operation)).toEqual([
				'path:idRole',
				'query:q',
				'path:idUser',
				'query:page'
			]);
			expect(schemaOf(operation?.requestBody)).toEqual({ allOf: [ref('User'), ref('Role')] });
			expect(schemaOf(operation?.responses?.['200'])).toEqual({
				anyOf: [ref('User'), ref('Other')]
			});
			expect(schemaOf(operation?.responses?.['401'])).toEqual(ref('Err'));
		});
	});

	test('should document file uploads as multipart binary', () => {
		const app = new Elysia().post(
			'/upload',
			{ body: t.Object({ file: t.File(), at: t.Date() }) },
			() => 1
		);

		expect(buildDocument(app).paths?.['/upload']?.post?.requestBody).toEqual({
			required: true,
			content: {
				'multipart/form-data': {
					schema: {
						type: 'object',
						properties: {
							file: { contentMediaType: 'application/octet-stream' },
							at: {
								anyOf: [
									{ type: 'string', format: 'date-time' },
									{ type: 'string' },
									{ type: 'number' }
								]
							}
						},
						required: ['file', 'at']
					}
				}
			}
		});
	});

	test('should document several files as multipart', () => {
		const app = new Elysia().post('/files', { body: t.Object({ files: t.Files() }) }, () => 1);

		expect(
			Object.keys(
				(
					buildDocument(app).paths?.['/files']?.post?.requestBody as
						| RequestBodyObject
						| undefined
				)?.content ?? {}
			)
		).toEqual(['multipart/form-data']);
	});

	test('should document raw binary bodies as octet-stream', () => {
		const app = new Elysia().post('/raw', { body: t.Uint8Array() }, () => 1);

		expect(buildDocument(app).paths?.['/raw']?.post?.requestBody).toEqual({
			required: true,
			content: {
				'application/octet-stream': {
					schema: { contentMediaType: 'application/octet-stream' }
				}
			}
		});
	});

	test('should document bodies from parse, primitives and descriptions', () => {
		const app = new Elysia()
			.post(
				'/parsed',
				{ parse: ['urlencoded', 'text'], body: t.Object({ a: t.String() }) },
				() => 1
			)
			.post('/text', { body: t.String({ description: 'Raw note' }) }, () => 1)
			.query('/', { body: t.Object({ q: t.String() }) }, () => 1);
		const { paths } = buildDocument(app);

		expect(
			Object.keys(
				(paths?.['/parsed']?.post?.requestBody as RequestBodyObject | undefined)?.content ??
					{}
			)
		).toEqual(['application/x-www-form-urlencoded']);
		expect(paths?.['/text']?.post?.requestBody).toEqual({
			description: 'Raw note',
			required: true,
			content: {
				'application/json': { schema: { type: 'string', description: 'Raw note' } },
				'text/plain': { schema: { type: 'string', description: 'Raw note' } }
			}
		});
		expect(paths?.['/']?.query?.requestBody).toBeDefined();
	});

	test('should document responses without body and with schema descriptions', () => {
		const app = new Elysia().get(
			'/r',
			{
				response: {
					200: t.Number({ description: 'Total' }),
					204: t.Null(),
					418: t.Boolean()
				}
			},
			() => 1
		);

		expect(buildDocument(app).paths?.['/r']?.get?.responses).toEqual({
			200: {
				description: 'Total',
				content: { 'text/plain': { schema: { type: 'number', description: 'Total' } } }
			},
			204: { description: 'No Content' },
			418: {
				description: "I'm a teapot",
				content: { 'text/plain': { schema: { type: 'boolean' } } }
			}
		});
	});

	test('should merge macro schemas', () => {
		const app = new Elysia()
			.macro({ auth: { headers: t.Object({ 'x-api-key': t.String() }) } })
			.get('/me', { auth: true, headers: t.Object({ lang: t.String() }) }, () => 1);

		expect(buildDocument(app).paths?.['/me']?.get?.parameters).toEqual([
			{ name: 'lang', in: 'header', required: true, schema: { type: 'string' } },
			{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }
		]);
	});

	test('should put custom methods in additionalOperations', () => {
		const app = new Elysia().route('PROPFIND', '/dav', () => 1);

		expect(buildDocument(app).paths?.['/dav']?.additionalOperations?.PROPFIND).toEqual({
			operationId: 'propfindDav'
		});
	});

	test('should apply instance tags and nest tags on slashes', () => {
		const mfa = new Elysia({ prefix: '/mfa', tags: ['auth/mfa'] }).get('/methods', () => 1);
		const app = new Elysia({ prefix: '/auth', tags: ['auth'] })
			.use(mfa)
			.get('/me', { detail: { tags: ['account'] } }, () => 1);
		const document = buildDocument(app, {
			tags: [{ name: 'auth', description: 'Authentication' }]
		});

		expect(document.paths?.['/auth/mfa/methods']?.get?.tags).toEqual(['auth/mfa']);
		expect(document.paths?.['/auth/me']?.get?.tags).toEqual(['auth', 'account']);
		expect(document.tags).toEqual([
			{ name: 'auth', description: 'Authentication' },
			{ name: 'auth/mfa', summary: 'mfa', parent: 'auth' },
			{ name: 'account' }
		]);
	});

	test('should drop empty branches and bodies from Elysia types', () => {
		const app = new Elysia().get(
			'/empty',
			{ response: { 200: t.Object({ name: t.MaybeEmpty(t.String()) }), 204: t.Void() } },
			() => ({ name: null })
		);

		expect(buildDocument(app).paths?.['/empty']?.get?.responses).toEqual({
			200: {
				description: 'OK',
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: { name: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
							required: ['name']
						}
					}
				}
			},
			204: { description: 'No Content' }
		});
	});

	test('should merge the base document', () => {
		const document = buildDocument(new Elysia(), {
			info: { title: 'MRX', version: '2.0.0' },
			servers: [{ url: 'https://api.mrx.dev' }]
		});

		expect(document.openapi).toBe('3.2.1');
		expect(document.info).toEqual({
			title: 'MRX',
			description: 'API documentation for Elysia',
			version: '2.0.0'
		});
		expect(document.servers).toEqual([{ url: 'https://api.mrx.dev' }]);
	});
});

describe.concurrent('buildDocument edge cases', () => {
	const operationOf = (
		app: AnyElysia,
		path: string,
		method: 'get' | 'post' = 'get'
	): OperationObject | undefined => buildDocument(app).paths?.[path as `/${string}`]?.[method];
	const contentOf = (body: unknown): Record<string, unknown> =>
		(body as { content?: Record<string, unknown> } | undefined)?.content ?? {};

	test('should drop path parameters a path does not template', () => {
		const app = new Elysia()
			.get('/static', { params: t.Object({ x: t.String() }) }, () => 1)
			.get('/o/:id?', { params: t.Object({ id: t.String() }) }, () => 1);

		expect(operationOf(app, '/static')?.parameters).toBeUndefined();
		expect(operationOf(app, '/o')?.parameters).toBeUndefined();
	});

	test('should keep operation ids unique and never inherit an instance one', () => {
		const app = new Elysia({ detail: { operationId: 'shared' } })
			.get('/a-b', () => 1)
			.get('/a_b', () => 1)
			.get('/f', () => 1)
			.get('/f/*', () => 1)
			.get('/x', { detail: { operationId: 'same' } }, () => 1)
			.get('/y', { detail: { operationId: 'same' } }, () => 1);
		const ids = Object.values(buildDocument(app).paths ?? {}).map(
			(item) => (item as PathItemObject).get?.operationId
		);

		expect(ids).toEqual(['getAB', 'getAB2', 'getF', 'getFAny', 'same', 'same2']);
	});

	test('should merge detail overrides into the generated operation', () => {
		const app = new Elysia()
			.get(
				'/p',
				{
					query: t.Object({ q: t.String() }),
					response: { 200: t.String(), 404: t.String() },
					detail: {
						parameters: [{ name: 'x', in: 'header', schema: { type: 'string' } }],
						responses: { 200: { description: 'Found' }, 500: { description: 'Boom' } }
					}
				},
				() => 'a'
			)
			.post(
				'/b',
				{
					body: t.Object({ a: t.String() }),
					// Elysia types `requestBody` as complete, a partial one is merged into the generated body
					detail: { requestBody: { description: 'Payload' } as never }
				},
				() => 1
			);
		const get = operationOf(app, '/p');
		const post = operationOf(app, '/b', 'post');

		expect(
			get?.parameters?.map((parameter) => ('in' in parameter ? parameter.name : ''))
		).toEqual(['q', 'x']);
		expect(get?.responses?.['200']).toEqual({
			description: 'Found',
			content: { 'text/plain': { schema: { type: 'string' } } }
		});
		expect(Object.keys(get?.responses ?? {})).toEqual(['200', '404', '500']);
		expect((post?.requestBody as RequestBodyObject | undefined)?.description).toBe('Payload');
		expect(Object.keys(contentOf(post?.requestBody))).toEqual([
			'application/json',
			'application/x-www-form-urlencoded',
			'multipart/form-data'
		]);
	});

	test('should document the macro parameter Elysia validates over the route one', async () => {
		const app = new Elysia()
			.macro({ paged: { query: t.Object({ page: t.Number() }) } })
			.get(
				'/c',
				{ paged: true, query: t.Object({ page: t.Optional(t.Number()) }) },
				() => 'ok'
			);

		expect((await app.handle(new Request('http://localhost/c'))).status).toBe(422);
		expect(operationOf(app, '/c')?.parameters).toEqual([
			{ name: 'page', in: 'query', required: true, schema: { type: 'number' } }
		]);
	});

	test('should read parameters from refs, unions and intersections of models', () => {
		const app = new Elysia()
			.model({
				Page: t.Object({ page: t.Number(), size: t.Optional(t.Number()) }),
				Search: t.Object({ q: t.String(), page: t.Number() })
			})
			.get('/ref', { query: t.Ref('Page') }, () => 1)
			.get('/union', { query: t.Union([t.Ref('Page'), t.Ref('Search')]) }, () => 1)
			.get('/intersect', { query: t.Intersect([t.Ref('Page'), t.Ref('Search')]) }, () => 1);
		const summary = (path: string): string[] | undefined =>
			operationOf(app, path)?.parameters?.map((parameter) =>
				'in' in parameter ? `${parameter.name}:${String(parameter.required)}` : ''
			);

		expect(summary('/ref')).toEqual(['page:true', 'size:false']);
		expect(summary('/union')).toEqual(['page:true', 'size:false', 'q:false']);
		expect(summary('/intersect')).toEqual(['page:true', 'size:false', 'q:true']);
	});

	test('should document response headers and media types', () => {
		const app = new Elysia()
			.get(
				'/h',
				{
					response: withHeaders(
						t.String(),
						t.Object({ 'x-rate': t.Number({ description: 'Left' }) })
					)
				},
				() => 'a'
			)
			.get('/bin', { response: t.Uint8Array() }, () => new Uint8Array(1))
			.get(
				'/mixed',
				{ response: t.Union([t.Object({ a: t.String() }), t.String()]) },
				() => 'a'
			);

		expect(operationOf(app, '/h')?.responses?.['200']).toEqual({
			description: 'OK',
			headers: {
				'x-rate': {
					description: 'Left',
					required: true,
					schema: { type: 'number', description: 'Left' }
				}
			},
			content: { 'text/plain': { schema: { type: 'string' } } }
		});
		expect(Object.keys(contentOf(operationOf(app, '/bin')?.responses?.['200']))).toEqual([
			'application/octet-stream'
		]);
		expect(contentOf(operationOf(app, '/mixed')?.responses?.['200'])).toEqual({
			'application/json': {
				schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }
			},
			'text/plain': { schema: { type: 'string' } }
		});
	});

	test('should only emit valid JSON Schema', () => {
		const app = new Elysia()
			.model({ Thing: t.Object({ a: t.Ref('Addr') }, { $id: 'https://example.com/thing' }) })
			.post(
				'/s',
				{
					body: t.Object({
						v: t.Void(),
						u: t.Undefined(),
						n: t.BigInt(),
						e: t.Union([t.Literal('a'), t.Literal('b')]),
						s: t.String({ nullable: true }),
						m: t.Ref('Missing'),
						w: t.Ref('Foo/Bar')
					})
				},
				() => 1
			);
		const document = buildDocument(app);

		expect(contentOf(operationOf(app, '/s', 'post')?.requestBody)['application/json']).toEqual({
			schema: {
				type: 'object',
				properties: {
					v: {},
					u: {},
					n: { type: 'integer' },
					e: { type: 'string', enum: ['a', 'b'] },
					s: { anyOf: [{ type: 'string' }, { type: 'null' }] },
					m: { $ref: '#/components/schemas/Missing' },
					w: { $ref: '#/components/schemas/Foo~1Bar' }
				},
				required: ['v', 'u', 'n', 'e', 's', 'm', 'w']
			}
		});
		expect(document.components?.schemas?.Thing).toEqual({
			type: 'object',
			properties: { a: { $ref: '#/components/schemas/Addr' } },
			required: ['a']
		});
	});

	test('should follow the body rules of Elysia and RFC 9110', () => {
		const app = new Elysia()
			.post('/optional', { body: t.Optional(t.Object({ a: t.String() })) }, () => 1)
			.post('/first', { parse: ['json', 'text'], body: t.Object({ a: t.String() }) }, () => 1)
			.post('/custom', { parse: ({ request }) => request.text(), body: t.String() }, () => 1)
			.post('/form', { parse: 'formdata', body: t.Object({ a: t.String() }) }, () => 1)
			.route('TRACE', '/trace', { body: t.Object({ a: t.String() }) }, () => 1);

		expect(
			(operationOf(app, '/optional', 'post')?.requestBody as RequestBodyObject | undefined)
				?.required
		).toBe(false);
		expect(Object.keys(contentOf(operationOf(app, '/first', 'post')?.requestBody))).toEqual([
			'application/json'
		]);
		expect(Object.keys(contentOf(operationOf(app, '/custom', 'post')?.requestBody))).toEqual([
			'*/*'
		]);
		expect(Object.keys(contentOf(operationOf(app, '/form', 'post')?.requestBody))).toEqual([
			'multipart/form-data',
			'application/x-www-form-urlencoded'
		]);
		expect(buildDocument(app).paths?.['/trace']?.trace?.requestBody).toBeUndefined();
	});

	test('should document parameters the way Elysia reads them', () => {
		const app = new Elysia().get(
			'/v-:version',
			{
				headers: t.Object({ authorization: t.String(), 'x-id': t.String() }),
				query: t.Object({
					limit: t.Number({ default: 10 }),
					filter: t.Object({ name: t.String() })
				})
			},
			() => 1
		);

		expect(operationOf(app, '/v-{version}')?.parameters).toEqual([
			{
				name: 'limit',
				in: 'query',
				required: false,
				schema: { default: 10, type: 'number' }
			},
			{
				name: 'filter',
				in: 'query',
				required: true,
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: { name: { type: 'string' } },
							required: ['name']
						}
					}
				}
			},
			{ name: 'x-id', in: 'header', required: true, schema: { type: 'string' } },
			{ name: 'version', in: 'path', required: true, schema: { type: 'string' } }
		]);
	});

	test('should let a method route win over a catch-all one and keep OPTIONS routes', () => {
		const app = new Elysia()
			.get('/ga', { detail: { summary: 'GET' } }, () => 'g')
			.all('/ga', { detail: { summary: 'ALL' } }, () => 'x')
			.options('/opt', () => 1);
		const { paths } = buildDocument(app);

		expect(paths?.['/ga']?.get?.summary).toBe('GET');
		expect(paths?.['/ga']?.post?.summary).toBe('ALL');
		expect(paths?.['/opt']?.options).toBeDefined();
	});

	test('should skip empty tag segments and merge base paths per item', () => {
		const document = buildDocument(
			new Elysia().get('/t', { detail: { tags: ['a//b', '/lead', ''] } }, () => 1),
			{ paths: { '/t': { summary: 'Base' } } }
		);

		expect(document.tags).toEqual([
			{ name: 'a' },
			{ name: 'a//b', summary: 'b', parent: 'a' },
			{ name: '/lead' }
		]);
		expect(document.paths?.['/t']?.summary).toBe('Base');
		expect(document.paths?.['/t']?.get?.tags).toEqual(['a//b', '/lead']);
	});

	test('should not repeat a schema shared by a guard macro and the route', () => {
		const app = new Elysia()
			.macro({ withP: { body: t.Object({ p: t.Number() }) } })
			.guard({ withP: true }, (guard) => guard.post('/d', { withP: true }, () => 1));

		expect(contentOf(operationOf(app, '/d', 'post')?.requestBody)['application/json']).toEqual({
			schema: { type: 'object', properties: { p: { type: 'number' } }, required: ['p'] }
		});
	});

	test('should document a body as optional when its model is or it accepts undefined', () => {
		const app = new Elysia()
			.model({ Maybe: t.Optional(t.Object({ a: t.String() })) })
			.post('/model', { body: 'Maybe' }, () => 1)
			.post(
				'/union',
				{ body: t.Union([t.Object({ a: t.String() }), t.Undefined()]) },
				() => 1
			)
			.post('/required', { body: t.Object({ a: t.String() }) }, () => 1);

		const requiredOf = (path: string): unknown =>
			(operationOf(app, path, 'post')?.requestBody as RequestBodyObject | undefined)
				?.required;
		expect(requiredOf('/model')).toBe(false);
		expect(requiredOf('/union')).toBe(false);
		expect(requiredOf('/required')).toBe(true);
	});

	test('should document the binary branches of a response union as octet-stream', () => {
		const app = new Elysia().get(
			'/b',
			{ response: t.Union([t.Uint8Array(), t.String()]) },
			() => 'x'
		);

		expect(contentOf(operationOf(app, '/b')?.responses?.['200'])).toEqual({
			'application/octet-stream': {
				schema: { contentMediaType: 'application/octet-stream' }
			},
			'text/plain': { schema: { type: 'string' } }
		});
	});

	test('should keep generated operation ids unique against the base ones', () => {
		const app = new Elysia().get('/users', () => 1);
		const document = buildDocument(app, {
			paths: { '/manual': { get: { operationId: 'getUsers' } } }
		});

		expect(document.paths?.['/manual']?.get?.operationId).toBe('getUsers');
		expect(document.paths?.['/users']?.get?.operationId).toBe('getUsers2');
	});

	test('should keep keyword values as they are', () => {
		const app = new Elysia().post(
			'/c',
			{
				body: t.Object({
					h: t.Object({ headers: t.String() }, { default: { headers: 'demo' } }),
					e: t.String({ examples: [{ type: 'undefined' }], 'x-note': { $id: 'kept' } })
				})
			},
			() => 1
		);

		expect(contentOf(operationOf(app, '/c', 'post')?.requestBody)['application/json']).toEqual({
			schema: {
				type: 'object',
				properties: {
					h: {
						type: 'object',
						default: { headers: 'demo' },
						properties: { headers: { type: 'string' } },
						required: ['headers']
					},
					e: {
						type: 'string',
						examples: [{ type: 'undefined' }],
						'x-note': { $id: 'kept' }
					}
				},
				required: ['h', 'e']
			}
		});
	});

	test('should combine a property shared by union and intersection branches', () => {
		const app = new Elysia()
			.get(
				'/union',
				{
					query: t.Union([
						t.Object({ value: t.Literal('a') }),
						t.Object({ value: t.Literal('b') })
					])
				},
				() => 1
			)
			.get(
				'/intersect',
				{
					query: t.Intersect([
						t.Object({ value: t.String({ minLength: 1 }) }),
						t.Object({ value: t.String({ maxLength: 3 }) })
					])
				},
				() => 1
			);

		expect(operationOf(app, '/union')?.parameters).toEqual([
			{
				name: 'value',
				in: 'query',
				required: true,
				schema: { type: 'string', enum: ['a', 'b'] }
			}
		]);
		expect(operationOf(app, '/intersect')?.parameters).toEqual([
			{
				name: 'value',
				in: 'query',
				required: true,
				schema: {
					allOf: [
						{ type: 'string', minLength: 1 },
						{ type: 'string', maxLength: 3 }
					]
				}
			}
		]);
	});
});

describe.concurrent('openapiPlugin', () => {
	test('should document routes registered after the plugin and hide its own', async () => {
		const app = new Elysia()
			.use(openapiPlugin({ path: '/openapi', specPath: '/openapi/json' }))
			.get('/late', () => 'late');

		const response = await app.handle(new Request('http://localhost/openapi/json'));

		expect(response.status).toBe(200);
		expect(Object.keys(((await response.json()) as OpenAPIObject).paths ?? {})).toEqual([
			'/late'
		]);
	});

	test('should serve the Scalar page pointing to the spec', async () => {
		const app = new Elysia().use(
			openapiPlugin({
				path: '/openapi',
				specPath: '/openapi/json',
				document: { info: { title: '<MRX>', version: '1' } }
			})
		);

		const response = await app.handle(new Request('http://localhost/openapi'));
		const html = await response.text();

		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(html).toContain('<title>&lt;MRX&gt;</title>');
		expect(html).toContain('"url":"/openapi/json"');
	});

	test('should serve the page and the spec at their default paths', async () => {
		const app = new Elysia().use(openapiPlugin()).get('/x', () => 1);

		const page = await app.handle(new Request('http://localhost/openapi'));
		const spec = await app.handle(new Request('http://localhost/openapi/json'));

		expect(await page.text()).toContain('"url":"/openapi/json"');
		expect(spec.status).toBe(200);
	});

	test('should point Scalar to the spec under the host prefix', async () => {
		const app = new Elysia({ prefix: '/api' }).use(
			openapiPlugin({ path: '/openapi', specPath: '/openapi/json' })
		);

		const html = await (await app.handle(new Request('http://localhost/api/openapi'))).text();
		const spec = await app.handle(new Request('http://localhost/api/openapi/json'));

		expect(html).toContain('"url":"/api/openapi/json"');
		expect(
			await (await app.handle(new Request('http://localhost/api/openapi/'))).text()
		).toContain('"url":"/api/openapi/json"');
		expect(spec.status).toBe(200);
	});
});

import { Elysia, type AnyElysia } from 'elysia';

import { buildDocument } from './document';
import type { OpenAPIObject } from './openapi-types-3.2';
import type { ScalarConfiguration } from './scalar-types';

const renderScalar = (
	title: string,
	configuration: ScalarConfiguration & { readonly url: string }
): string => `<!doctype html>
<html>
	<head>
		<title>${Bun.escapeHTML(title)}</title>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
	</head>
	<body>
		<div id="app"></div>
		<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
		<script>
			Scalar.createApiReference('#app', ${JSON.stringify(configuration).replaceAll('<', '\\u003c')});
		</script>
	</body>
</html>`;

export interface OpenAPIOptions {
	/** @default '/openapi' */
	readonly path?: string;
	/** @default `${path}/json` */
	readonly specPath?: string;
	readonly scalar?: ScalarConfiguration;
	readonly document?: Partial<OpenAPIObject>;
}

export const openapiPlugin = ({
	path = '/openapi',
	specPath = `${path}/json`,
	scalar,
	document: base
}: OpenAPIOptions = {}): (<const App extends AnyElysia>(host: App) => App) => {
	const scalarOptions: ScalarConfiguration = {
		defaultOpenAllTags: false,
		defaultOpenFirstTag: false,
		documentDownloadType: 'both',
		expandAllModelSections: false,
		expandAllResponses: false,
		expandAllSchemaProperties: false,
		hideClientButton: true,
		hideDarkModeToggle: false,
		hideModels: false,
		hideSearch: false,
		hideTestRequestButton: false,
		isEditable: false,
		layout: 'modern',
		operationTitleSource: 'summary',
		orderRequiredPropertiesFirst: true,
		orderSchemaPropertiesBy: 'preserve',
		persistAuth: true,
		showDeveloperTools: 'localhost',
		showOperationId: true,
		showSidebar: true,
		telemetry: false,
		withDefaultFonts: true,
		expandAllParameters: true,
		theme: 'elysiajs',
		mcp: {
			disabled: true
		},
		agent: {
			disabled: true
		},
		darkMode: true,
		...scalar
	};

	return <const App extends AnyElysia>(host: App): App => {
		let document: OpenAPIObject | undefined;
		const getDocument = (): OpenAPIObject => (document ??= buildDocument(host, base));

		host.use(
			new Elysia<'openapiPlugin'>({ name: 'openapiPlugin' }).guard(
				{ detail: { hide: true } },
				(plugin) =>
					plugin
						.get(
							path,
							({ path: requestPath }) =>
								new Response(
									renderScalar(getDocument().info.title, {
										...scalarOptions,
										// keeps any prefix the host mounted the plugin under, with or without a trailing slash
										url:
											requestPath.replace(/\/$/, '').slice(0, -path.length) +
											specPath
									}),
									{ headers: { 'content-type': 'text/html; charset=utf-8' } }
								)
						)
						.get(specPath, getDocument)
			)
		);
		return host;
	};
};

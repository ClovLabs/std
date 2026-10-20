import type { ServerObject } from './openapi-types-3.2';

/**
 * The Scalar API reference configuration options.
 *
 * Only the JSON-serializable ones: the configuration is inlined in the page with `JSON.stringify`, so
 * functions (events, `customFetch`, `plugins`, slug generators, custom sorters) would be dropped. `url` is
 * set by the plugin.
 */
export interface ScalarConfiguration {
	readonly authentication?: {
		readonly preferredSecurityScheme?: string | readonly (string | readonly string[])[];
		readonly securitySchemes?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
		readonly createAnySecurityScheme?: boolean;
	};
	readonly agent?: { readonly key?: string; readonly disabled?: boolean };
	readonly baseServerURL?: string;
	readonly customCss?: string;
	readonly darkMode?: boolean;
	readonly defaultHttpClient?: { readonly targetKey: string; readonly clientKey: string };
	readonly defaultOpenAllTags?: boolean;
	readonly defaultOpenFirstTag?: boolean;
	readonly defaultRequestBodyView?: 'form' | 'raw';
	readonly documentDownloadType?: 'json' | 'yaml' | 'both' | 'direct' | 'none';
	readonly expandAllModelSections?: boolean;
	readonly expandAllParameters?: boolean;
	readonly expandAllResponses?: boolean;
	readonly expandAllSchemaProperties?: boolean;
	readonly favicon?: string;
	/** `target/client` ids, like `shell/curl` */
	readonly featuredClients?: readonly string[];
	readonly forceDarkModeState?: 'dark' | 'light';
	readonly hiddenClients?:
		| true
		| readonly string[]
		| Readonly<Record<string, boolean | readonly string[]>>;
	readonly hideClientButton?: boolean;
	readonly hideDarkModeToggle?: boolean;
	readonly hideModelNames?: boolean;
	readonly hideModels?: boolean;
	readonly hideSearch?: boolean;
	readonly hideTestRequestButton?: boolean;
	readonly isEditable?: boolean;
	readonly layout?: 'modern' | 'classic';
	readonly localization?: {
		readonly locale?: string;
		readonly direction?: 'ltr' | 'rtl' | 'auto';
		readonly translations?: Readonly<Record<string, unknown>>;
	};
	readonly maxVisibleRequestBodyProperties?: number;
	readonly mcp?: { readonly name?: string; readonly url?: string; readonly disabled?: boolean };
	readonly metaData?: Readonly<Record<string, string>>;
	readonly modelsSectionLabel?: string;
	readonly oauth2RedirectUri?: string;
	readonly operationsSorter?: 'alpha' | 'method';
	readonly operationTitleSource?: 'summary' | 'path';
	readonly orderRequiredPropertiesFirst?: boolean;
	readonly orderSchemaPropertiesBy?: 'alpha' | 'preserve';
	readonly pathRouting?: { readonly basePath: string };
	readonly persistAuth?: boolean;
	/** ESM modules default-exporting a plugin */
	readonly pluginUrls?: readonly string[];
	readonly proxyUrl?: string;
	readonly schemaKeyboardNav?: boolean;
	readonly searchHotKey?: string;
	readonly servers?: readonly ServerObject[];
	readonly showDeveloperTools?: 'always' | 'localhost' | 'never';
	readonly showExtensions?: readonly `x-${string}`[];
	readonly showOperationId?: boolean;
	readonly showSidebar?: boolean;
	readonly tagsSorter?: 'alpha';
	readonly telemetry?: boolean;
	readonly theme?:
		| 'alternate'
		| 'bluePlanet'
		| 'deepSpace'
		| 'default'
		| 'elysiajs'
		| 'fastify'
		| 'kepler'
		| 'laserwave'
		| 'mars'
		| 'moon'
		| 'none'
		| 'purple'
		| 'saturn'
		| 'solarized';
	readonly withDefaultFonts?: boolean;
}

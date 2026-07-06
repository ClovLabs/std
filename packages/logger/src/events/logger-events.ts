import type { EventMap } from '@dws-std/common';
import type { Exception } from '@dws-std/error';

export interface LoggerEvent extends EventMap {
	onBeforeExitError: [Exception<{ error: Error }>];
	registerSinkError: [
		Exception<{
			sinkName: string;
			error: Error;
		}>
	];
	sinkError: [
		Exception<{
			sinkName: string;
			object?: unknown;
			error: Error;
		}>
	];
	drained: [];
}

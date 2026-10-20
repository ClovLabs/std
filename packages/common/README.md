<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/common/logo-common.svg" alt="Clov Common logo" width="200" />
</p>

# Clov Common

Small helpers shared by the other `@clov-std` packages: a human-readable duration parser, a typed event emitter, and a way to run a function in a worker without a separate file.

```bash
bun add @clov-std/common
```

## `parseHumanTime`

Turns `'2 hours'` into a number, so a TTL in your config reads like a duration instead of `7200`.

```ts
import { parseHumanTime } from '@clov-std/common';

parseHumanTime('2 hours'); // 7200 (seconds by default)
parseHumanTime('30 mins'); // 1800
parseHumanTime('1 day'); // 86400
parseHumanTime('2 weeks'); // 1209600
parseHumanTime('1 year'); // 31557600
```

The second argument picks the output unit:

```ts
parseHumanTime('1 hour', 'minutes'); // 60
parseHumanTime('1 day', 'hours'); // 24
parseHumanTime('1 second', 'ms'); // 1000
```

Offsets in the past or future work too:

```ts
parseHumanTime('30 mins ago'); // -1800
parseHumanTime('+1 day'); // 86400
parseHumanTime('-2 hours'); // -7200
parseHumanTime('1 hour from now'); // 3600
```

Accepted units:

| Unit   | Aliases                                 |
| ------ | --------------------------------------- |
| Second | `s`, `sec`, `secs`, `second`, `seconds` |
| Minute | `m`, `min`, `mins`, `minute`, `minutes` |
| Hour   | `h`, `hr`, `hrs`, `hour`, `hours`       |
| Day    | `d`, `day`, `days`                      |
| Week   | `w`, `week`, `weeks`                    |
| Year   | `y`, `yr`, `yrs`, `year`, `years`       |

Anything it can't parse throws an `Exception` with one of the `PARSE_HUMAN_TIME_ERROR_CODES`.

## `TypedEventEmitter`

Node's `EventEmitter`, with event names and listener arguments checked against a map you declare. Each key is an event, each value the tuple of arguments its listeners receive. Declare the map with `type`, not `interface`: an interface would have to extend `EventMap`, and its index signature would let any event name through.

```ts
import { TypedEventEmitter } from '@clov-std/common';

type JobEvents = {
	progress: [percent: number];
	done: [result: string];
	cancelled: [];
};

class Job extends TypedEventEmitter<JobEvents> {}

const job = new Job();

job.on('progress', (percent) => console.log(`${percent}%`)); // percent: number
job.once('done', (result) => console.log(result)); // result: string

job.emit('progress', 50);
job.emit('cancelled');
```

A typo in the event name or a wrong payload is a compile error:

```ts
job.emit('progres', 50); // ❌ not a key of JobEvents
job.emit('progress', '50'); // ❌ string is not assignable to number
```

`on`, `once`, `off`, `addListener`, `removeListener`, `prependListener`, `prependOnceListener`, `listeners`, `rawListeners` and `listenerCount` are all typed the same way.

## `createWorker`

Runs a function in a Bun `Worker` without a separate file. The arguments after the function are passed to it inside the worker.

```ts
import { createWorker } from '@clov-std/common';

const worker = createWorker(
	(a: number, b: number) => {
		postMessage(a + b);
	},
	2,
	40
);

worker.addEventListener('message', (event: MessageEvent) => {
	console.log(event.data); // 42
	worker.terminate();
});
```

The function is turned into a string and evaluated in the worker, which has two consequences:

- It can't use anything from the scope it was written in: no module imports, no outer variables. Use dynamic `import()` inside the function instead.
- Arguments go through `JSON.stringify`, so only JSON-serializable values make it across (no functions, `Date` becomes a string, and so on).

```ts
const worker = createWorker(async (input: string) => {
	const { escapeHTML } = await import('bun');
	postMessage(escapeHTML(input));
}, '<b>hi</b>');
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).

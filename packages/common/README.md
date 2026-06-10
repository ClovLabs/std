# 🧰 DWS Common

Small utilities you'll want everywhere, but don't belong to any specific domain.  
Instead of copy-pasting the same helpers across every project, `@dws-std/common` collects them in one place so you can just import and move on.

## 📌 Table of Contents

- [Installation](#-installation)
- [Utilities](#-utilities)
    - [parseHumanTime](#parsehumantime)
- [License](#-license)

## 🔧 Installation

```bash
bun add @dws-std/common
```

## 🛠️ Utilities

### `parseHumanTime`

Converts a human-readable time expression into a numeric value in the unit of your choice.  
Useful anywhere you need to define durations without sprinkling magic numbers — JWT expiry, TTLs, rate-limit windows, you name it.

```ts
import { parseHumanTime } from '@dws-std/common';

parseHumanTime('2 hours'); // 7200 (seconds by default)
parseHumanTime('30 mins'); // 1800
parseHumanTime('1 day'); // 86400
parseHumanTime('2 weeks'); // 1209600
parseHumanTime('1 year'); // 31557600
```

Choose a different output unit with the second argument:

```ts
parseHumanTime('1 hour', 'minutes'); // 60
parseHumanTime('1 day', 'hours'); // 24
parseHumanTime('1 second', 'ms'); // 1000
```

Past and future offsets are also supported:

```ts
parseHumanTime('30 mins ago'); // -1800
parseHumanTime('+1 day'); // 86400
parseHumanTime('-2 hours'); // -7200
parseHumanTime('1 hour from now'); // 3600
```

**Supported units:**

| Unit   | Accepted aliases                        |
| ------ | --------------------------------------- |
| Second | `s`, `sec`, `secs`, `second`, `seconds` |
| Minute | `m`, `min`, `mins`, `minute`, `minutes` |
| Hour   | `h`, `hr`, `hrs`, `hour`, `hours`       |
| Day    | `d`, `day`, `days`                      |
| Week   | `w`, `week`, `weeks`                    |
| Year   | `y`, `yr`, `yrs`, `year`, `years`       |

Throws an `Exception` if the expression is invalid or the unit is unrecognised.


## 📚 API Reference

Full docs: [Dominus-Web-Service.github.io/packages](https://Dominus-Web-Service.github.io/packages/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)

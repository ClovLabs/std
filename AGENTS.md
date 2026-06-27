# Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## TypeScript and Project

1. Use explicit visibility modifiers (`public`, `protected`, `private`) on class members. Add `readonly`, `override`, etc. when applicable.
2. Naming conventions:
    - `camelCase` for variables, functions, methods, parameters, and properties
    - `PascalCase` for classes, interfaces, types, and enums
    - `SCREAMING_CASE` for constants
3. Typing:
    - Always type function parameters, return values, class properties, exported values, and public APIs
    - Let TypeScript infer obvious local variables
    - Never use `any`; use `unknown` when the type is not known safely
    - Prefer `interface` for extendable object shapes
    - Use `type` for unions, intersections, mapped types, utility types, and function signatures
4. Control structures: omit curly braces for single-statement bodies when it stays readable.
5. Imports:
    - Use `#/` for internal imports
    - Do not import barrel files except as public entry points
    - Remove imports made unused by your changes
6. Function style:
    - Use standard method syntax for class methods
    - Prefer arrow functions for helpers, callbacks, and higher-order functions unless `function` syntax is required
7. Match the existing project style over personal preference.

## Contribution Principles

1. Follow language-specific best practices and idiomatic patterns.
2. Preserve the existing code structure and modular organization.
3. Keep changes focused on the requested task.
4. Do not introduce new tooling, dependencies, patterns, or conventions unless explicitly requested.

## Commit Message Convention

Use Conventional Commits.

Format:

`type(scope): summary`

Rules:

- `type` must be lowercase
- `scope` is optional and describes the affected module or area
- `summary` must be concise, imperative, and max 72 characters
- Body is optional; when used, add a blank line after the summary and explain context or reasoning

Allowed types:

- `feat` - New feature
- `fix` - Bug fix
- `perf` - Performance improvement
- `refactor` - Code change without behavior change
- `build` - Build tools or dependency changes
- `types` - Type definitions
- `chore` - Maintenance or non-code changes
- `docs` - Documentation changes
- `test` - Tests
- `style` - Formatting/style only
- `ci` - CI/CD configuration

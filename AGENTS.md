# DWeis Next AGENTS.md

Single-file guide for AI agents, in opencode's style. The Electron main process lives in
`electron/`, the Vite + React renderer in `src/`, dev tooling in `scripts/`. Requires
Node >= 22.22.2 and `pnpm@9.14.4` via corepack — run commands as `corepack pnpm ...`.

- The default branch in this repo is `main`. Never commit/push directly on `main` — cut a
  short-lived branch, pass the gate, open a PR to upstream `main`, merge, then delete the branch.
- Quality gate, in CI order (`.github/workflows/pr.yml`): `lint` (oxlint) → `format`
  (oxfmt --check) → `ts-check` (tsgo, NOT tsc) → `test` (vitest run) → `build`
  (= ts-check + vite build). Run the full gate before pushing a branch.
- Single test: `corepack pnpm exec vitest run electron/domain.test.ts`. Tests are colocated
  `*.test.ts(x)` under `electron/`, `src/`, `scripts/`, run in pure Node, and must not import
  electron (CI sets `ELECTRON_OVERRIDE_DIST_PATH` as a defensive stub; a transitive electron
  import breaks that assumption).
- `bootstrap` — idempotent init: downloads the dev Electron copy (`.electron-dist/`, dev
  `dweis-local` scheme), oo CLI (`.oo-bin/`), bundled skills, ripgrep, and builds the
  agent-tool-runtime. Rerun when `.dweis-dev/bootstrap.json` env vars are missing.
- `dev:worktree` — preferred dev launch: per-worktree Vite port and isolated `./dweis` userData
  (initialized once from the canonical repo when missing/empty). `dev` — source checkout; Vite is
  fixed on port 5273 with `strictPort`, so a second instance fails fast instead of hopping ports.
- `auth:clean` — reset the current checkout to a signed-out profile (start here for login /
  sign-out / first-run work). `auth:status` — report profile and cookie state without printing
  credentials. `auth:capture` / `auth:save` / `auth:restore` are deprecated.
- Scripts run directly with `node --experimental-strip-types` (no build step): TS parameter
  properties are unsupported (use explicit fields + constructor assignment), and relative imports
  must carry a `.ts` extension. Renderer alias `@/` → `src/` (tsconfig paths + vite).
- Endpoint and branding are single sources of truth: `electron/domain.ts` and `electron/branding.ts`.
  The `__OO_ENDPOINT__` define must stay in sync between `vite.config.ts` and `vitest.config.ts`.
- `electron/agent/` must stay electron-free so headless smoke tests can construct an
  `AgentManager` directly. Never use synchronous fs APIs in the Electron main process — use
  `node:fs/promises` (a few one-off exceptions exist in `electron/auth/store.ts` and
  `electron/settings/store.ts`; do not spread them).
- English everywhere: comments, docs, commit messages, branch/PR copy. i18n is flat dot keys with
  a zh-CN baseline + en mirror — new copy must be added to both locales.
- Never delete the two `@source` lines in `src/styles/theme.css` (Tailwind v4 does not scan
  node_modules; those packages' classes would not be generated).
- Capability changes must be synced across three places: tools config in `config.ts`, permission
  policy, and `system-prompt.ts`.
- For project-operating detail beyond this file — bootstrap steps, worktree/concurrency rules,
  dev debugging, and the integrated-browser design contract — read the
  [self guide](docs/self-guide.md); read only the section that matches the current task.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type
prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use
the affected area when helpful, e.g. `electron`, `agent`, `settings`, `chat`, or `renderer`.

Examples: `fix(chat): simplify thinking toggle styling`, `docs: update contributing guide`,
`chore(agent): regenerate tool sources`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the
  helper is reused, hides a genuinely complex boundary, or has a clear independent name that
  improves the caller.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless
  necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter
  to maintain type inference downstream

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await readFile(path.join(dir, "journal.json"), "utf8")

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await readFile(journalPath, "utf8")
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed imports like
  `resolve as pathResolve`.
- Never use star imports. Do not use `import * as Foo from "..."` or `import type * as Foo from "..."`.
- Prefer dynamic imports for heavy modules that are only needed in selected code paths, especially
  in startup-sensitive entrypoints. Destructure dynamic import bindings near the top of the
  narrowest scope that needs them so they read like normal imports. Keep branch-specific imports
  inside the branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read
as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  // ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names
  a real concept like `requireConfig` or `readMetadata`.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or
  control flow.

## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the
  only option.
- Test actual implementation, do not duplicate logic into tests.
- Run `corepack pnpm exec vitest run <file>` from the repo root; tests are colocated with sources.

## Type Checking

- Always run `pnpm run ts-check` (tsgo, NOT tsc) from the repo root.

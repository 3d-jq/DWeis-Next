# DWeis Next Self Guide

Single-file self guide for AI agents working in this repository: how to bootstrap, develop,
debug, and which design decisions must survive. Read this when you need project-operating detail
beyond AGENTS.md. Read only the section that matches the current task.

## What this is

DWeis Next's Electron desktop AI-agent client (fork of oomol-lab/wanta, local self-managed only):
Vite + React renderer (`src/`), Electron main process (`electron/`), Node dev tooling (`scripts/`).
Requires Node >= 22.22.2 and `pnpm@9.14.4` via corepack — run commands as `corepack pnpm ...`.

## Bootstrap

Fresh-checkout initialization; rerun any time the checkout is partially initialized (idempotent).

1. Run `corepack pnpm run bootstrap`.
2. Run `corepack pnpm run dev:worktree` for worktree-aware development. If the current worktree's
   `./dweis` userData is missing or empty, it is initialized once from the canonical repo's
   `./dweis` when that source exists and is non-empty.
3. The product is local self-managed only — there is no cloud login. First run goes straight to
   the custom-model setup screen. To reset dev state to first-run, delete `./dweis` (or the
   worktree's `./dweis`) — `dev:worktree` re-initializes it from the canonical repo when available.
4. If the checkout is partially initialized, rerun `corepack pnpm run bootstrap`; it is idempotent.
5. Run the quality gate when needed: `ts-check` → `lint` → `format` → `test` → `build`.

### Dev userData

- Source `corepack pnpm run dev` uses `<repo>/dweis` as the complete Electron userData directory.
- `corepack pnpm run dev:worktree` uses `<worktree>/dweis` as the complete Electron userData
  directory, never the canonical repo's directory directly.
- `dev:worktree` copies the canonical repo's `./dweis` only when the target `./dweis` is missing or
  empty. Existing worktree state is never overwritten.
- No auth state exists: `operatingMode` in `dweis/settings.json` records `self-managed` (after the
  first-run model setup) or `unselected` (before).

### Dev launch

- Worktree-aware default: `corepack pnpm run dev:worktree`
- Source-checkout dev: `corepack pnpm run dev`
- Headless renderer startup only: `corepack pnpm run dev:no-electron`
- Disable Electron auto-start when you want the Vite process without an app window:
  `DWEIS_ELECTRON_AUTO_START=0 corepack pnpm run dev`
- Protocol-handler debugging requires the dev protocol handler:
  `DWEIS_SKIP_PROTOCOL_REGISTRATION=0 corepack pnpm run dev:worktree`. Use only one such session per
  machine.

### Known initialization outputs

- `.electron-dist/`
- `.oo-bin/`
- `resources/skills/`
- `resources/agent-tool-runtime/`
- `.dweis-dev/bootstrap.json`
- `.dweis-dev/env.sh`
- `dweis/`

The generated worktree env isolates the dev session by setting:

- `DWEIS_DEV_SERVER_PORT`
- `DWEIS_SKIP_PROTOCOL_REGISTRATION=1`
- `DWEIS_USER_DATA_DIR`

If any of these are missing after bootstrap, rerun `corepack pnpm run bootstrap` before debugging.

## Worktree and Concurrency

Use when the repo is opened in a fresh worktree and multiple agents may run in parallel.

### Current state

- `corepack pnpm run bootstrap` derives a per-worktree Vite port and records the worktree Electron
  userData directory.
- `corepack pnpm run dev:worktree` reads `.dweis-dev/bootstrap.json` and launches with that isolated
  environment.
- Ordinary product work starts from the worktree's `./dweis`. If it is missing or empty,
  `dev:worktree` initializes it once from the canonical repo's `./dweis` when available.
- First-run work (operating mode / model setup) can reset the worktree by deleting `./dweis`
  (startup then re-initializes it from the canonical repo, or shows the first-run setup if none).

### Shared resources and safe assumptions

- Raw `corepack pnpm run dev` still uses the default Vite port, but its Electron userData path is
  `<repo>/dweis` instead of the platform default, and it may register the `dweis-local` protocol
  handler.
- The canonical repo's `./dweis` is a one-time initialization source for empty worktree `./dweis`
  directories; it is never used as a shared runtime profile.
- Only one session per machine should enable protocol registration (deep-link debugging).
- One active `corepack pnpm run dev` per machine is the default safe mode; `dev:worktree` is the
  safer default for parallel agent work.
- Existing worktree `./dweis` data is never overwritten by startup.
- `DWEIS_ELECTRON_AUTO_START=0` is useful when you want the build/watch loop without auto-launch.
- Branches should stay short-lived and isolated from `main`.

### What to watch

- Port collisions
- Shared user data
- Shared protocol registration
- Missing or first-run `./dweis` profiles (model not configured yet)
- Any background process that survives a stopped dev session

### Worktree-safe startup

1. Run `corepack pnpm run bootstrap`.
2. Run `corepack pnpm run dev:worktree`.

If no canonical `./dweis` exists, the worktree still starts normally and shows the first-run model
setup.

## Dev Debugging

Use when the agent needs to start the desktop app, inspect it, and keep working without human
screen sharing.

### Launch

- `corepack pnpm run dev:worktree`
- `VITE_DWEIS_ROUTE=settings corepack pnpm run dev:worktree`
- `VITE_DWEIS_SMOKE="hello" corepack pnpm run dev:worktree`
- `DWEIS_SKIP_PROTOCOL_REGISTRATION=0 corepack pnpm run dev:worktree` only when debugging deep-link
  handling; keep this to one active session per machine.

### Runtime state modes

- Normal product work: launch with `dev:worktree`; an empty worktree `./dweis` initializes once from
  the canonical repo's `./dweis` when available.
- First-run / model-setup work: delete `./dweis` (or the worktree's copy), then launch with
  `dev:worktree`; the app shows the custom-model setup until `operatingMode` becomes `self-managed`.
- If the app shows the model-setup screen but a model is already configured, check
  `dweis/settings.json` — `operatingMode` should be `self-managed`.

Do not ask the user to describe a logged-in screen; there is no login in this product.

### What to inspect

- The Vite terminal output
- Electron main-process logs
- `dweis/logs/diagnostics.jsonl` when using `dev` or `dev:worktree`
- `~/Library/Application Support/dweis/logs/diagnostics.jsonl` for packaged app runs (macOS;
  Windows packaged runs use `%APPDATA%`)
- the live app window

### Inspection helpers

- macOS: `osascript` for window/process state, `screencapture` for full-screen or region capture
- Windows: capture screenshots to a scratch dir (e.g. `D:\tmp`)
- `cat .dweis-dev/bootstrap.json` for the active worktree port, protocol scheme, and user-data path
- `lsof -iTCP:<port> -sTCP:LISTEN` (macOS) / `netstat -ano` (Windows) for port conflicts

### Common failure modes

- Electron window never appears
- app stays on the first-run model setup because `./dweis` was reset or the model config is missing
- the worktree port is already taken
- a stale Electron process is still alive after a stopped session

### Debugging rule

Do not ask a human to describe the screen if the machine can already capture it.

## Integrated Browser — Design Memory

Read [docs/integrated-browser.md](docs/integrated-browser.md) before changing the feature. The V1
is implemented; the decisions below must survive context compaction and remain the design contract
for future changes.

### Decisions

- Use `WebContentsView` owned by Electron main.
- Use stable `playwright-core` rather than a custom DOM, AX, locator, or wait implementation.
- Connect Playwright to `webContents.debugger` through its public `ConnectOverCDPTransport`.
- Keep browser input available to the user at all times.
- Reuse Default Access and Full Access; do not add browser permission UX or match rules.
- Default Access consequential-action handling is an agent behavioral policy, not a hard guarantee.
- Login, credentials, and CAPTCHA are manual and resume in a new user turn.
- Use separate flat tools. Do not add arbitrary Playwright code or a query DSL.
- Expose the tool group through one real DWeis-owned built-in `browser` Skill so users can select
  `$browser`; do not turn individual tools into references or add another plugin abstraction.
- Use a dedicated persistent browser partition; never import Chrome profile data.
- Keep the localhost bridge small: one runtime credential, runtime session binding, bounded input,
  cancellation, and a concise error set.
- Prefer deleting scope over adding compatibility layers.

### Verified evidence

- `playwright-core` exposes `chromium.connectOverCDP(ConnectOverCDPTransport)` and
  `page.ariaSnapshot({ mode: "ai" })`.
- Electron 42.4.0 is the version pinned by this repository.
- Directly forwarding the root CDP transport connects but exposes no page; a minimal relay
  synthetically handles `Browser.getVersion`, `Browser.setDownloadBehavior`, and the root
  `Target.setAutoAttach`, announces one page session, and forwards page commands and events through
  `webContents.debugger`. Synthetic transport responses must be delivered asynchronously.
- `playwright-core.connectOverCDP()` changes the attached page's color scheme; calling
  `page.emulateMedia({ colorScheme: null })` after connection restores Electron theme inheritance.

### Scope guard

Stop and ask before adding any of the following:

- Multiple tabs or popup-preserving OAuth.
- File upload, download history, custom download paths, or automatic agent access to downloaded
  files.
- Chrome extension or login-state transfer.
- Persistent page restore across app restarts.
- Browser-specific confirmation UI, domain rules, or a second reviewer.
- Arbitrary page JavaScript or Playwright code.
- More than one page per task.
- A lifecycle state machine beyond live, hidden, crashed, and disposed.

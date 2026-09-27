# DWeis Next

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="DWeis Next" width="128" height="128" />
</div>
<p align="center">
  A general-purpose AI coding agent desktop app — no telemetry, no account binding, open capabilities
</p>
<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

DWeis Next is a general-purpose AI coding workbench: a local desktop app plus an agent
runtime. Model requests go directly to the endpoints you configure (API key or any
compatible service) — no cloud platform account involved.

DWeis Next is based on [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3
(Apache License 2.0). The required modification notice under Apache License 2.0 §4(b) is
in [NOTICE.md](NOTICE.md); the diff checklist against upstream lives in
[docs/dweis-next-plan.md](docs/dweis-next-plan.md).

## Key differences from upstream

- **No telemetry**: ARMS RUM, warehouse event reporting and the OpenTelemetry export
  chain are removed. The app produces and sends no analytics and stores no device
  fingerprint.
- **No account system**: OAuth login, CodingPlan membership/purchase/enterprise orders
  and conversation sharing are removed. No account entries in settings, no account
  traffic at runtime.
- **Direct model requests**: no platform gateway — requests are sent verbatim to the
  endpoints you configure.
- **Local-only configuration**: the built-in provider/model list comes from the bundled
  `config/provider/zcode-builtin.json` and cannot be modified remotely.
- **Auto-update off by default**: the app never contacts an update feed unless
  `ZCODE_UPDATE_FEED_URL` points to your own one.

Kept general capabilities: the plugin marketplace (official plugins bundled, any
third-party marketplace can be added), scheduled automations and off-peak tasks, dynamic
workflows, MCP, and local app usage statistics.

## Repository layout

| Directory                             | Contents                                          |
| ------------------------------------- | ------------------------------------------------- |
| `packages/desktop`                    | Electron desktop app (main, host, renderer)       |
| `packages/ui`                         | Shared React components, hooks and Zustand stores |
| `packages/services`                   | Business services                                 |
| `packages/shared`                     | Shared protocol and types                         |
| `packages/provider` / `provider-node` | Model provider configuration and runtime          |
| `packages/rpc` / `packages/client`    | RPC framework and agent client SDK                |
| `apps/zcode-cli`                      | Agent CLI and runtime sources                     |

Web (`packages/web` / `packages/server`) and the remote link are scheduled for removal —
see [docs/dweis-next-plan.md](docs/dweis-next-plan.md).

## Getting started

You need Git, Node.js **24.14.0** and pnpm **10.33.2** — versions are pinned in
[mise.toml](mise.toml). Run all commands from the repository root.

```bash
pnpm bootstrap
```

`pnpm bootstrap` installs workspace dependencies, prepares local desktop runtime assets
and runs `build:bootstrap`. The agent CLI sources under
[apps/zcode-cli/](apps/zcode-cli/) ship with the repository — no submodule init needed.

## Development

```bash
pnpm dev:desktop

# Test environment
pnpm dev:desktop:test
```

`pnpm dev:desktop` defaults to `pnpm dev:desktop:prod`. The launcher prepares local
runtime assets, builds the desktop agent, then starts Electron with source watching.
Set `ZCODE_DATA_BASE_DIR` for an isolated data directory.

### Configuration

Copy [.env.example](.env.example) to `.env` as needed; local overrides go to
`.env.local`.

| Setting                              | Purpose                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| `ZCODE_DATA_BASE_DIR`                | App data base directory; data lives under `.dweis/`          |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Local provider config file; falls back to the bundled config |
| `ZCODE_UPDATE_FEED_URL`              | Your own update feed; auto-update stays off unless set       |

### CLI

```bash
pnpm --filter @zcode/cli dev
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

### Checks

| Command                             | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `pnpm typecheck`                    | Type checking                         |
| `pnpm lint` / `pnpm lint:fix`       | Linting                               |
| `pnpm verify:pre-push`              | Pre-push checks (lint + architecture) |
| `pnpm architecture:check --changed` | Architecture check                    |
| `pnpm knip`                         | Unused dependencies and exports       |

## Packaging

```bash
pnpm bundle:desktop

# Target platform and CPU architecture
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

The default target is macOS arm64; output goes to `packages/desktop/dist/`. `--os`
accepts `mac`, `win`, `linux`; `--arch` accepts `x64`, `arm64`. Building and signing for
a platform requires that platform's toolchain.

## License

Licensed under the [Apache License 2.0](LICENSE). Contains modifications to
[zai-org/ZCode](https://github.com/zai-org/ZCode) — see [NOTICE.md](NOTICE.md) for the
modification notice and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for
third-party component information.

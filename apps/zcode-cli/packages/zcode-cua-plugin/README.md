# @zcode/zcode-cua-plugin

DWeis Next 的电脑控制（Computer Use）官方插件包。

## 组成

| 内容 | 说明 |
|---|---|
| `.zcode-plugin/plugin.json` | 插件 manifest（skill-only，无 manifest mcpServers——工具由 built-in `computer-use` server 提供） |
| `skills/computer-use/SKILL.md` | 模型侧指引：观察-动作-观察循环、element 优先、权限自查 |
| `dist/mcp/server.js` | 构建产物：`@zcode/computer-use-mcp` 的 MCP server（plugin-host 以 stdio 加载） |
| `node_modules/@trycua/**` | 构建产物：驱动及其平台二进制闭包（seed 白名单经 `runtimeTopLevelPaths` 携带） |

## 工具面如何接入产品

- **注册**：`bootstrap` 的 `resolveBuiltInComputerUseMcpServer` 在本插件 enabled 时
  以裸名 `computer-use` 注册 built-in MCP server（模型侧前缀 `mcp__computer-use__*`，
  与操作浮层事件、`cua-app-snapshot` 的既有前缀直接对齐）。
- **引擎**：`@trycua/cua-driver`（MIT），工具目录由上游 `listToolsJson()` 动态决定。
- **与上游 Helper/broker 链路无关**：不拉 Helper、不读 broker socket；
  Windows 无权限门槛，macOS 权限链保持既有实现（本期不启用）。

## 构建

```bash
pnpm --filter @zcode/zcode-cua-plugin build
```

构建 = esbuild 打包 server（`@trycua/cua-driver` 保持 external）+ 把驱动闭包
vendor 进本包 `node_modules`（含 `.node` 平台二进制守卫）。

行为规格与验收场景见 `docs/specs/computer-use.md`。

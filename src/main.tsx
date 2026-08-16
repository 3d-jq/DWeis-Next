import { ConnectionClient } from "@oomol/connection"
import { ElectronClientAdapter } from "@oomol/connection-electron-adapter/client"
import { createRoot } from "react-dom/client"
import { AttentionService } from "../electron/attention/common.ts"
import { AutomationService } from "../electron/automation/common.ts"
import { BrowserService } from "../electron/browser/common.ts"
import { ChatService } from "../electron/chat/common.ts"
import { GitService } from "../electron/git/common.ts"
import { KnowledgeService } from "../electron/knowledge/common.ts"
import { McpService } from "../electron/mcp/common.ts"
import { MemoryService } from "../electron/memory/common.ts"
import { ModelsService } from "../electron/models/common.ts"
import { SessionService } from "../electron/session/common.ts"
import { SettingsService } from "../electron/settings/common.ts"
import { SkillService } from "../electron/skills/common.ts"
import { UsageService } from "../electron/stats/common.ts"
import { UpdateService } from "../electron/update/common.ts"
import { App } from "@/App"
import { AppContext } from "@/components/AppContext"
import { detectInitialLocale, translate } from "@/i18n/i18n"
import { reportRendererIssue } from "@/lib/renderer-diagnostics"

import "@univerjs/preset-sheets-core/lib/index.css"
import "./index.css"

const electronConnectionBridgeName = "oomol-connection-electron-bridge"
const rootElement = document.querySelector("#root")
if (!rootElement) {
  throw new Error("DWeis Next: missing #root mount node")
}

document.documentElement.dataset.platform = globalThis.dweisnext?.platform ?? "browser"
document.documentElement.dataset.window = "main"
installRendererErrorReporting()
migrateLegacyStorageKeys()

if (!hasElectronConnectionBridge()) {
  const error = new Error("DWeis Next: missing Electron connection bridge")
  reportRendererIssue("error", "startup.connectionBridge", error.message, error)
  renderStartupError(rootElement)
} else {
  const client = new ConnectionClient(new ElectronClientAdapter())
  client.start()

  const chatService = client.use(ChatService)
  const attentionService = client.use(AttentionService)
  const automationService = client.use(AutomationService)
  const browserService = client.use(BrowserService)
  const gitService = client.use(GitService)
  const knowledgeService = client.use(KnowledgeService)
  const mcpService = client.use(McpService)
  const memoryService = client.use(MemoryService)
  const sessionService = client.use(SessionService)
  const skillService = client.use(SkillService)
  const modelsService = client.use(ModelsService)
  const settingsService = client.use(SettingsService)
  const updateService = client.use(UpdateService)
  const usageService = client.use(UsageService)

  createRoot(rootElement).render(
    <AppContext.Provider
      value={{
        attentionService,
        automationService,
        browserService,
        chatService,
        gitService,
        knowledgeService,
        mcpService,
        memoryService,
        sessionService,
        skillService,
        modelsService,
        settingsService,
        updateService,
        usageService,
      }}
    >
      <App />
    </AppContext.Provider>,
  )
}

function hasElectronConnectionBridge(): boolean {
  return Boolean((globalThis as Record<string, unknown>)[electronConnectionBridgeName])
}

/**
 * 品牌重命名一次性迁移：把旧前缀（wanta. / wanta:）的 localStorage key 复制到新前缀（dweis），
 * 保留旧 key 不删除（至少一版双读回退），避免老用户主题/侧边栏/面板宽度等配置静默丢失。
 * 必须在任何 Provider 读取存储 key 之前执行（模块顶层调用）。
 */
function migrateLegacyStorageKeys(): void {
  try {
    const storage = window.localStorage
    const legacyKeys: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key?.startsWith("wanta.") || key?.startsWith("wanta:")) {
        legacyKeys.push(key)
      }
    }
    for (const key of legacyKeys) {
      const value = storage.getItem(key)
      if (value !== null) {
        storage.setItem(`dweis${key.slice("wanta".length)}`, value)
      }
    }
  } catch {
    // 迁移 best-effort：localStorage 不可用时静默跳过，不影响启动。
  }
}

function renderStartupError(container: Element): void {
  const locale = detectInitialLocale()
  createRoot(container).render(
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-base font-medium">{translate(locale, "app.startupFailedTitle")}</h1>
          <p className="text-sm text-muted-foreground">{translate(locale, "app.startupBridgeMissingDescription")}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          onClick={() => window.location.reload()}
        >
          {translate(locale, "app.reload")}
        </button>
      </div>
    </main>,
  )
}

function installRendererErrorReporting(): void {
  const report = (source: "error" | "unhandledrejection", cause: unknown): void => {
    reportRendererIssue(source, "global", "renderer global error", cause)
  }
  window.addEventListener("error", (event) => {
    report("error", event.error ?? event.message)
  })
  window.addEventListener("unhandledrejection", (event) => {
    report("unhandledrejection", event.reason)
  })
}

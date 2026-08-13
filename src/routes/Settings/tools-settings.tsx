import type { GenerationConfig, SearchConfig } from "../../../electron/settings/common.ts"

import { ImageIcon, SearchIcon, Settings2, X } from "lucide-react"
import * as React from "react"
import { SettingsItem, SettingsSection } from "./settings-section.tsx"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useI18n } from "@/i18n/i18n"

const compactLabel = "oo-text-micro font-medium text-muted-foreground"

function ConfigRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={compactLabel}>
        {label}
      </Label>
      {children}
    </div>
  )
}

type SearchTestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; count: number }
  | { kind: "error"; message: string }

/** 用当前填写的 token 探测一次搜索 API（与 websearch 工具同款请求），返回成功/失败。 */
async function probeSearchProvider(
  provider: SearchConfig["provider"],
  apiKey: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (provider === "exa") {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ query: "test", numResults: 1 }),
      })
      const data = (await res.json().catch(() => ({}))) as { results?: unknown[]; message?: string }
      if (!res.ok) return { ok: false, error: `${res.status} ${data.message ?? ""}`.trim() }
      return { ok: true, count: (data.results ?? []).length }
    }
    if (provider === "brave") {
      const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      })
      const data = (await res.json().catch(() => ({}))) as {
        web?: { results?: unknown[] }
        message?: string
        error?: { message?: string }
      }
      if (!res.ok) return { ok: false, error: `${res.status} ${data.message ?? data.error?.message ?? ""}`.trim() }
      return { ok: true, count: (data.web?.results ?? []).length }
    }
    if (provider === "serper") {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        body: JSON.stringify({ q: "test", num: 1 }),
      })
      const data = (await res.json().catch(() => ({}))) as { organic?: unknown[]; message?: string }
      if (!res.ok) return { ok: false, error: `${res.status} ${data.message ?? ""}`.trim() }
      return { ok: true, count: (data.organic ?? []).length }
    }
    // tavily（默认）
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1, search_depth: "basic" }),
    })
    const data = (await res.json().catch(() => ({}))) as { results?: unknown[]; message?: string; error?: string }
    if (!res.ok) return { ok: false, error: `${res.status} ${data.message ?? data.error ?? ""}`.trim() }
    return { ok: true, count: (data.results ?? []).length }
  } catch (error) {
    return { ok: false, error: String(error instanceof Error ? error.message : error) }
  }
}

/** 网页搜索「测试连接」按钮：用当前填写的 token 发一次真实请求，就地显示结果。 */
function SearchTestButton({ provider, apiKey }: { provider: SearchConfig["provider"]; apiKey: string }) {
  const { t } = useI18n()
  const [state, setState] = React.useState<SearchTestState>({ kind: "idle" })

  const run = React.useCallback(async () => {
    const key = apiKey.trim()
    if (!key) {
      setState({ kind: "error", message: t("settings.toolsSearchTestNoKey") })
      return
    }
    setState({ kind: "running" })
    const result = await probeSearchProvider(provider, key)
    if (result.ok) {
      setState({ kind: "success", count: result.count ?? 0 })
    } else {
      setState({ kind: "error", message: result.error ?? "" })
    }
  }, [apiKey, provider, t])

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 px-2 text-xs"
        disabled={state.kind === "running"}
        onClick={run}
      >
        {state.kind === "running" ? t("settings.toolsSearchTestRunning") : t("settings.toolsSearchTest")}
      </Button>
      {state.kind === "success" ? (
        <span className="oo-text-micro min-w-0 truncate text-success">
          {t("settings.toolsSearchTestSuccess", { count: state.count })}
        </span>
      ) : state.kind === "error" ? (
        <span className="oo-text-micro min-w-0 truncate text-destructive">
          {t("settings.toolsSearchTestFailed", { error: state.message })}
        </span>
      ) : null}
    </div>
  )
}

/** 设置 → 工具：用户自定义配置 AI 生成（图片/视频）与网页搜索工具（紧凑布局，配置即时生效——热加入无需重启）。 */
export function ToolsSettings() {
  const { t } = useI18n()
  const { settings, setGenerationConfig, setSearchConfig, setToolSecret, getToolSecret } = useAppSettings()
  const generation = settings.generationConfig
  const search = settings.searchConfig

  const [generationKey, setGenerationKey] = React.useState("")
  const [searchKey, setSearchKey] = React.useState("")
  const [keysLoaded, setKeysLoaded] = React.useState(false)
  const [generationDialogOpen, setGenerationDialogOpen] = React.useState(false)
  const [searchDialogOpen, setSearchDialogOpen] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void Promise.all([getToolSecret("generation"), getToolSecret("search")]).then(([gen, srch]) => {
      if (!cancelled) {
        setGenerationKey(gen ?? "")
        setSearchKey(srch ?? "")
        setKeysLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [getToolSecret])

  const updateGeneration = (patch: Partial<GenerationConfig>): void => {
    void setGenerationConfig(
      generation ? { ...generation, ...patch } : { apiBase: "", modelName: "", enabled: true, ...patch },
    )
  }

  const updateSearch = (patch: Partial<SearchConfig>): void => {
    void setSearchConfig(search ? { ...search, ...patch } : { provider: "tavily", enabled: true, ...patch })
  }

  const removeGeneration = (): void => {
    void setGenerationConfig(null)
    void setToolSecret("generation", null)
    setGenerationKey("")
  }

  const removeSearch = (): void => {
    void setSearchConfig(null)
    void setToolSecret("search", null)
    setSearchKey("")
  }

  return (
    <SettingsSection title={t("settings.categoryTools")}>
      {/* AI 生成（图片/视频） */}
      <SettingsItem
        title={t("settings.toolsGenerationTitle")}
        description={t("settings.toolsGenerationDescription")}
        icon={ImageIcon}
      >
        <div className="flex items-center justify-end gap-2">
          {generation?.enabled ? (
            <Button size="sm" variant="secondary" onClick={() => setGenerationDialogOpen(true)}>
              <Settings2 className="size-4" />
              {t("settings.toolsConfigure")}
            </Button>
          ) : null}
          <Switch checked={generation?.enabled ?? false} onCheckedChange={(enabled) => updateGeneration({ enabled })} />
        </div>
      </SettingsItem>

      {/* 网页搜索 */}
      <SettingsItem
        title={t("settings.toolsSearchTitle")}
        description={t("settings.toolsSearchDescription")}
        icon={SearchIcon}
      >
        <div className="flex items-center justify-end gap-2">
          {search?.enabled ? (
            <Button size="sm" variant="secondary" onClick={() => setSearchDialogOpen(true)}>
              <Settings2 className="size-4" />
              {t("settings.toolsConfigure")}
            </Button>
          ) : null}
          <Switch checked={search?.enabled ?? false} onCheckedChange={(enabled) => updateSearch({ enabled })} />
        </div>
      </SettingsItem>

      {/* AI 生成配置弹窗 */}
      <Dialog
        open={generationDialogOpen}
        onClose={() => setGenerationDialogOpen(false)}
        title={t("settings.toolsGenerationTitle")}
        description={t("settings.toolsGenerationDescription")}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => {
                removeGeneration()
                setGenerationDialogOpen(false)
              }}
            >
              <X className="size-4" />
              {t("settings.toolsRemove")}
            </Button>
            <Button size="sm" onClick={() => setGenerationDialogOpen(false)}>
              {t("common.close")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <ConfigRow id="gen-base" label={t("settings.toolsGenerationApiBase")}>
            <Input
              id="gen-base"
              value={generation?.apiBase ?? ""}
              placeholder="https://api.example.com/v1"
              onChange={(event) => updateGeneration({ apiBase: event.target.value })}
            />
          </ConfigRow>
          <div className="grid grid-cols-2 gap-3">
            <ConfigRow id="gen-key" label={t("settings.toolsGenerationApiKey")}>
              <Input
                id="gen-key"
                type="password"
                value={generationKey}
                placeholder={keysLoaded ? "••••••••" : t("settings.toolsKeyPlaceholder")}
                onChange={(event) => setGenerationKey(event.target.value)}
                onBlur={() => void setToolSecret("generation", generationKey.trim() || null)}
              />
            </ConfigRow>
            <ConfigRow id="gen-model" label={t("settings.toolsGenerationModel")}>
              <Input
                id="gen-model"
                value={generation?.modelName ?? ""}
                placeholder="gpt-image-1"
                onChange={(event) => updateGeneration({ modelName: event.target.value })}
              />
            </ConfigRow>
          </div>
          <ConfigRow id="gen-video" label={t("settings.toolsGenerationVideoModel")}>
            <Input
              id="gen-video"
              value={generation?.videoModelName ?? ""}
              placeholder={t("settings.toolsGenerationVideoModelPlaceholder")}
              onChange={(event) => updateGeneration({ videoModelName: event.target.value || undefined })}
            />
          </ConfigRow>
        </div>
      </Dialog>

      {/* 网页搜索配置弹窗 */}
      <Dialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        title={t("settings.toolsSearchTitle")}
        description={t("settings.toolsSearchDescription")}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => {
                removeSearch()
                setSearchDialogOpen(false)
              }}
            >
              <X className="size-4" />
              {t("settings.toolsRemove")}
            </Button>
            <Button size="sm" onClick={() => setSearchDialogOpen(false)}>
              {t("common.close")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <ConfigRow id="search-provider" label={t("settings.toolsSearchProvider")}>
              <Select
                value={search?.provider ?? "tavily"}
                onValueChange={(provider) => updateSearch({ provider: provider as SearchConfig["provider"] })}
              >
                <SelectTrigger id="search-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tavily">Tavily</SelectItem>
                  <SelectItem value="exa">Exa</SelectItem>
                  <SelectItem value="brave">Brave Search</SelectItem>
                  <SelectItem value="serper">Serper</SelectItem>
                </SelectContent>
              </Select>
            </ConfigRow>
            <ConfigRow id="search-key" label={t("settings.toolsSearchApiKey")}>
              <Input
                id="search-key"
                type="password"
                value={searchKey}
                placeholder={keysLoaded ? "••••••••" : t("settings.toolsKeyPlaceholder")}
                onChange={(event) => setSearchKey(event.target.value)}
                onBlur={() => void setToolSecret("search", searchKey.trim() || null)}
              />
            </ConfigRow>
          </div>
          <SearchTestButton provider={search?.provider ?? "tavily"} apiKey={searchKey} />
        </div>
      </Dialog>
    </SettingsSection>
  )
}

import type { McpServerEntry, McpTransportType } from "../../../electron/mcp/common.ts"

import { PencilIcon, PlusIcon, ServerIcon, Trash2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  mcpEntryFromJson,
  mcpEntryToJson,
  parseKeyValueLines,
  stringifyKeyValueLines,
} from "../../../electron/mcp/common.ts"
import { SettingsItem } from "./settings-section.tsx"
import { Button } from "@/components/ui/button"
import {
  ConfirmDialog,
  ConfirmDialogAction,
  ConfirmDialogCancel,
  ConfirmDialogContent,
  ConfirmDialogDescription,
  ConfirmDialogFooter,
  ConfirmDialogHeader,
  ConfirmDialogTitle,
} from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMcpServers } from "@/hooks/useMcpServers"
import { useT } from "@/i18n/i18n"

const mcpTypeLabelKey: Record<
  McpTransportType,
  "settings.mcpTypeStdio" | "settings.mcpTypeHttp" | "settings.mcpTypeSse"
> = {
  stdio: "settings.mcpTypeStdio",
  http: "settings.mcpTypeHttp",
  sse: "settings.mcpTypeSse",
}

function newMcpServerId(): string {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 设置 → MCP 服务：stdio / http / sse 服务管理（表单或 JSON 编辑）。 */
export function McpServersSettings() {
  const t = useT()
  const { deleteServer, loading, saveServer, servers } = useMcpServers()
  const [editing, setEditing] = React.useState<McpServerEntry | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<McpServerEntry | null>(null)

  const openCreate = () => {
    setEditing({
      enabled: true,
      id: newMcpServerId(),
      name: "",
      type: "stdio",
    })
    setCreating(true)
  }

  return (
    <>
      <SettingsItem title={t("settings.mcpTitle")} description={t("settings.mcpDescription")} icon={ServerIcon}>
        <Button type="button" size="sm" onClick={openCreate} disabled={loading}>
          <PlusIcon className="size-4" />
          {t("settings.mcpAdd")}
        </Button>
      </SettingsItem>
      {servers.length > 0 ? (
        <div className="grid gap-1.5 px-4 pb-4">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--oo-divider)] px-3 py-2"
            >
              <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="oo-text-caption-compact truncate font-medium text-foreground">{server.name}</div>
                <div className="oo-text-micro truncate text-muted-foreground">
                  {server.type === "stdio" ? (server.command ?? "") : (server.url ?? "")}
                </div>
              </div>
              <span className="oo-text-micro shrink-0 rounded-full border border-[var(--oo-frame-border)] px-2 py-0.5 text-foreground">
                {t(mcpTypeLabelKey[server.type])}
              </span>
              <span
                className={`oo-text-micro shrink-0 rounded-full border px-2 py-0.5 ${
                  server.enabled ? "border-[var(--oo-frame-border)] text-foreground" : "text-muted-foreground"
                }`}
              >
                {server.enabled ? t("settings.mcpEnabled") : t("settings.mcpDisabled")}
              </span>
              <button
                type="button"
                aria-label={t("settings.mcpEdit")}
                className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                onClick={() => {
                  setEditing({ ...server })
                  setCreating(false)
                }}
              >
                <PencilIcon className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={t("settings.mcpDelete")}
                className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                onClick={() => setDeleting(server)}
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="oo-text-caption px-4 pb-4 text-muted-foreground">{t("settings.mcpEmpty")}</p>
      )}

      {editing ? (
        <McpServerDialog
          creating={creating}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (server) => {
            await saveServer(server)
            setEditing(null)
            toast.success(t("settings.mcpSaved"))
          }}
        />
      ) : null}

      <ConfirmDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>{t("settings.mcpDeleteConfirmTitle")}</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              {t("settings.mcpDeleteConfirm", { name: deleting?.name ?? "" })}
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <ConfirmDialogCancel>{t("common.cancel")}</ConfirmDialogCancel>
            <ConfirmDialogAction
              onClick={async () => {
                if (deleting) {
                  await deleteServer(deleting.id)
                  setDeleting(null)
                }
              }}
            >
              {t("settings.mcpDelete")}
            </ConfirmDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>
    </>
  )
}

function McpServerDialog({
  creating,
  initial,
  onClose,
  onSave,
}: {
  creating: boolean
  initial: McpServerEntry
  onClose: () => void
  onSave: (server: McpServerEntry) => Promise<void>
}) {
  const t = useT()
  const [draft, setDraft] = React.useState<McpServerEntry>(initial)
  const [mode, setMode] = React.useState<"form" | "json">("form")
  const [jsonText, setJsonText] = React.useState(() => mcpEntryToJson(initial))
  const [saving, setSaving] = React.useState(false)
  const type = draft.type

  const setType = (next: McpTransportType) => {
    setDraft((current) => ({ ...current, type: next }))
  }

  const switchMode = (next: "form" | "json") => {
    if (next === "json") {
      setJsonText(mcpEntryToJson(draft))
    }
    setMode(next)
  }

  const submit = async () => {
    if (mode === "json") {
      const parsed = mcpEntryFromJson(draft.name.trim() || t("settings.mcpNamePlaceholder"), jsonText)
      if (!parsed) {
        toast.error(t("settings.mcpJsonInvalid"))
        return
      }
      setSaving(true)
      try {
        await onSave({ ...parsed, id: draft.id })
      } finally {
        setSaving(false)
      }
      return
    }
    if (!draft.name.trim() || (type === "stdio" ? !draft.command?.trim() : !draft.url?.trim())) {
      toast.error(t("settings.mcpValidation"))
      return
    }
    setSaving(true)
    try {
      await onSave({ ...draft, name: draft.name.trim() })
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel = "oo-text-caption-compact font-medium text-muted-foreground"
  const sectionTitle = "oo-text-caption-compact font-semibold tracking-[0.08em] text-muted-foreground uppercase"

  return (
    <ConfirmDialog open onOpenChange={(open) => !open && onClose()}>
      <ConfirmDialogContent className="max-w-xl">
        <ConfirmDialogHeader className="flex flex-row items-start justify-between gap-3">
          <div className="grid gap-1">
            <ConfirmDialogTitle>{creating ? t("settings.mcpAdd") : t("settings.mcpEdit")}</ConfirmDialogTitle>
            <ConfirmDialogDescription>{t("settings.mcpDialogHint")}</ConfirmDialogDescription>
          </div>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(next) => next && switchMode(next as "form" | "json")}
            variant="segmented"
            spacing={1}
            className="shrink-0"
          >
            <ToggleGroupItem value="form">{t("settings.mcpModeForm")}</ToggleGroupItem>
            <ToggleGroupItem value="json">{t("settings.mcpModeJson")}</ToggleGroupItem>
          </ToggleGroup>
        </ConfirmDialogHeader>

        {mode === "form" ? (
          <div className="grid gap-4">
            <section className="grid gap-2">
              <h4 className={sectionTitle}>{t("settings.mcpSectionBasics")}</h4>
              <label className="grid gap-1">
                <span className={fieldLabel}>{t("settings.mcpName")}</span>
                <Input
                  value={draft.name}
                  placeholder={t("settings.mcpNamePlaceholder")}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
            </section>

            <section className="grid gap-2 border-t border-[var(--oo-divider)] pt-3">
              <h4 className={sectionTitle}>{t("settings.mcpSectionConnection")}</h4>
              <label className="grid gap-1">
                <span className={fieldLabel}>{t("settings.mcpType")}</span>
                <ToggleGroup
                  type="single"
                  value={type}
                  onValueChange={(next) => next && setType(next as McpTransportType)}
                  variant="segmented"
                  spacing={1}
                  className="grid w-full grid-cols-3"
                >
                  <ToggleGroupItem value="stdio">stdio</ToggleGroupItem>
                  <ToggleGroupItem value="http">http</ToggleGroupItem>
                  <ToggleGroupItem value="sse">sse</ToggleGroupItem>
                </ToggleGroup>
              </label>
              {type === "stdio" ? (
                <>
                  <label className="grid gap-1">
                    <span className={fieldLabel}>{t("settings.mcpCommand")}</span>
                    <Input
                      value={draft.command ?? ""}
                      placeholder={t("settings.mcpCommandPlaceholder")}
                      onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className={fieldLabel}>{t("settings.mcpArgs")}</span>
                    <Input
                      value={draft.args ?? ""}
                      placeholder={t("settings.mcpArgsPlaceholder")}
                      onChange={(event) => setDraft((current) => ({ ...current, args: event.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <label className="grid gap-1">
                  <span className={fieldLabel}>{t("settings.mcpUrl")}</span>
                  <Input
                    value={draft.url ?? ""}
                    placeholder={type === "sse" ? "https://example.com/mcp/sse" : "https://example.com/mcp"}
                    onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
                  />
                </label>
              )}
            </section>

            <section className="grid gap-2 border-t border-[var(--oo-divider)] pt-3">
              <h4 className={sectionTitle}>{t("settings.mcpSectionAdvanced")}</h4>
              <div className="grid grid-cols-2 gap-2.5">
                {type === "stdio" ? (
                  <label className="grid gap-1">
                    <span className={fieldLabel}>{t("settings.mcpCwd")}</span>
                    <Input
                      value={draft.cwd ?? ""}
                      placeholder={t("settings.mcpCwdPlaceholder")}
                      onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))}
                    />
                  </label>
                ) : null}
                <label className="grid gap-1">
                  <span className={fieldLabel}>{t("settings.mcpTimeout")}</span>
                  <Input
                    type="number"
                    min={0}
                    value={draft.timeout ?? ""}
                    placeholder={t("settings.mcpTimeoutPlaceholder")}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10)
                      setDraft((current) => ({
                        ...current,
                        timeout: Number.isFinite(value) && value > 0 ? value : undefined,
                      }))
                    }}
                  />
                </label>
              </div>
              <label className="grid gap-1">
                <span className={fieldLabel}>
                  {type === "stdio" ? t("settings.mcpEnvironment") : t("settings.mcpHeaders")}
                </span>
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={stringifyKeyValueLines(type === "stdio" ? draft.environment : draft.headers)}
                  placeholder={"FOO=bar\nBAZ=qux"}
                  onChange={(event) => {
                    const parsed = parseKeyValueLines(event.target.value)
                    setDraft((current) =>
                      type === "stdio" ? { ...current, environment: parsed } : { ...current, headers: parsed },
                    )
                  }}
                />
              </label>
            </section>
          </div>
        ) : (
          <div className="grid gap-2 border-t border-[var(--oo-divider)] pt-3">
            <label className="grid gap-1">
              <span className={fieldLabel}>{t("settings.mcpJsonHint")}</span>
              <Textarea
                rows={14}
                className="resize-y font-mono text-xs leading-relaxed whitespace-pre tab-4"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
        )}

        <ConfirmDialogFooter>
          <ConfirmDialogCancel>{t("common.cancel")}</ConfirmDialogCancel>
          <ConfirmDialogAction onClick={submit} disabled={saving}>
            {t("settings.mcpSave")}
          </ConfirmDialogAction>
        </ConfirmDialogFooter>
      </ConfirmDialogContent>
    </ConfirmDialog>
  )
}

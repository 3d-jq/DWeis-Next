import type { LucideIcon } from "lucide-react"

import { BrainCircuitIcon, BrainIcon, SaveIcon, TimerIcon, UserRoundIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { SettingsItem, SettingsSection } from "./settings-section.tsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useMemory } from "@/hooks/useMemory"
import { useI18n } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

// 字符上限与主进程 memory 工具（tool-sources.ts）保持一致：内容每轮注入 system prompt。
const AGENT_MEMORY_LIMIT = 2200
const USER_MEMORY_LIMIT = 1375

function MemoryEditor({
  title,
  description,
  icon: Icon,
  placeholder,
  limit,
  value,
  onValueChange,
}: {
  title: string
  description: string
  icon: LucideIcon
  placeholder: string
  limit: number
  value: string
  onValueChange: (value: string) => void
}) {
  const overLimit = value.length > limit
  return (
    <section className="grid gap-2 border-b border-[var(--oo-divider)] px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="oo-text-label text-foreground">{title}</h3>
          <div className="oo-text-caption mt-0.5 max-w-[44rem] text-muted-foreground">{description}</div>
        </div>
      </div>
      <Textarea
        rows={10}
        style={{ fieldSizing: "fixed" }}
        className="h-[240px] resize-none overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <div className="flex justify-end">
        <span
          className={cn(
            "oo-text-micro text-muted-foreground tabular-nums",
            overLimit && "font-medium text-destructive",
          )}
        >
          {value.length} / {limit}
        </span>
      </div>
    </section>
  )
}

export function MemorySettings() {
  const { t } = useI18n()
  const { content, loading, save } = useMemory()
  const appSettings = useAppSettings()
  const [agent, setAgent] = React.useState("")
  const [user, setUser] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  // 服务端内容就绪后首次回填（之后以本地编辑态为准，避免 agent 写入与编辑互相覆盖）。
  React.useEffect(() => {
    if (!loaded && content) {
      setAgent(content.agent)
      setUser(content.user)
      setLoaded(true)
    }
  }, [content, loaded])

  const dirty = loaded && (agent !== (content?.agent ?? "") || user !== (content?.user ?? ""))

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await save({ agent, user })
      toast.success(t("settings.memorySaved"))
    } catch {
      toast.error(t("settings.memorySaveFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection title={t("settings.categoryMemory")}>
      <SettingsItem
        title={t("settings.memoryAutoReview")}
        description={t("settings.memoryAutoReviewDescription")}
        icon={BrainCircuitIcon}
      >
        <Switch
          checked={appSettings.settings.autoMemoryReview}
          aria-label={t("settings.memoryAutoReview")}
          onCheckedChange={(enabled) => void appSettings.setAutoMemoryReview(enabled)}
        />
      </SettingsItem>
      <SettingsItem
        title={t("settings.memoryAutoReviewInterval")}
        description={t("settings.memoryAutoReviewIntervalDescription")}
        icon={TimerIcon}
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={50}
            className="w-20"
            value={appSettings.settings.autoMemoryReviewInterval}
            onChange={(event) => void appSettings.setAutoMemoryReviewInterval(Number(event.target.value))}
          />
          <span className="oo-text-caption text-muted-foreground">{t("settings.memoryAutoReviewIntervalUnit")}</span>
        </div>
      </SettingsItem>
      <MemoryEditor
        title={t("settings.memoryAgentTitle")}
        description={t("settings.memoryAgentDescription")}
        icon={BrainIcon}
        placeholder={t("settings.memoryAgentPlaceholder")}
        limit={AGENT_MEMORY_LIMIT}
        value={agent}
        onValueChange={setAgent}
      />
      <MemoryEditor
        title={t("settings.memoryUserTitle")}
        description={t("settings.memoryUserDescription")}
        icon={UserRoundIcon}
        placeholder={t("settings.memoryUserPlaceholder")}
        limit={USER_MEMORY_LIMIT}
        value={user}
        onValueChange={setUser}
      />
      <SettingsItem title={t("settings.memorySaveTitle")} icon={SaveIcon}>
        <Button type="button" size="sm" disabled={saving || loading || !dirty} onClick={() => void handleSave()}>
          {saving ? t("settings.memorySaving") : t("settings.memorySave")}
        </Button>
      </SettingsItem>
    </SettingsSection>
  )
}

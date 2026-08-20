import type { SettingsCategory } from "@/components/app-shell/app-shell-types.ts"
import type { UseAppUpdate } from "@/hooks/useAppUpdate"
import type { MessageKey } from "@/i18n/i18n"

import {
  BarChart3Icon,
  BellRingIcon,
  BotIcon,
  BrainIcon,
  CpuIcon,
  WrenchIcon,
  GlobeIcon,
  HardDriveIcon,
  InfoIcon,
  MonitorIcon,
  PaletteIcon,
  RefreshCwIcon,
  ServerIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"
import { AboutSettings, UpdateChannelSettings } from "./about-settings.tsx"
import { PaletteSettings, ThemeSettings, LanguageSettings } from "./appearance-settings.tsx"
import { KnowledgeBetaToggle } from "./beta-settings.tsx"
import { BrowserSettings } from "./browser-settings.tsx"
import { McpServersSettings } from "./mcp-servers-settings.tsx"
import { MemorySettings } from "./memory-settings.tsx"
import { ModelSettings, RuntimeProfileSummary, SubagentModelSettings } from "./model-settings.tsx"
import { NotificationSettings } from "./notifications-settings.tsx"
import { SettingsItem, SettingsSection } from "./settings-section.tsx"
import { StorageSettings } from "./storage-settings.tsx"
import { ToolsSettings } from "./tools-settings.tsx"
import { UsageStatsSettings } from "./usage-settings.tsx"
import { useTheme } from "@/components/theme-context"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useAttention } from "@/hooks/useAttention"
import { useI18n } from "@/i18n/i18n"
import { cn } from "@/lib/utils"
import { useModelCatalog } from "@/routes/Chat/useModelCatalog"

export function SettingsRoute({
  category,
  onBack,
  onNavigateCategory,
  titlebarActions,
  update,
}: {
  category: SettingsCategory
  onBack: () => void
  onNavigateCategory: (category: SettingsCategory) => void
  titlebarActions: React.ReactNode
  update: UseAppUpdate
}) {
  const { palette: preferencePalette, preference, setPalette: setPreferencePalette, setPreference } = useTheme()
  const { locale, setLocale, t } = useI18n()
  const appSettings = useAppSettings()
  const attention = useAttention()
  const models = useModelCatalog()

  const categories: Array<{
    key: SettingsCategory
    labelKey: MessageKey
    icon: React.ComponentType<{ className?: string }>
    show: boolean
  }> = [
    { key: "appearance", labelKey: "settings.categoryAppearance", icon: PaletteIcon, show: true },
    { key: "browser", labelKey: "settings.categoryBrowser", icon: GlobeIcon, show: true },
    { key: "storage", labelKey: "settings.categoryStorage", icon: HardDriveIcon, show: true },
    { key: "notifications", labelKey: "settings.categoryNotifications", icon: BellRingIcon, show: true },
    { key: "models", labelKey: "settings.categoryModels", icon: CpuIcon, show: true },
    { key: "subagent", labelKey: "settings.categorySubagent", icon: BotIcon, show: true },
    { key: "mcp", labelKey: "settings.categoryMCP", icon: ServerIcon, show: true },
    { key: "memory", labelKey: "settings.categoryMemory", icon: BrainIcon, show: true },
    { key: "tools", labelKey: "settings.categoryTools", icon: WrenchIcon, show: true },
    { key: "usage", labelKey: "settings.categoryUsage", icon: BarChart3Icon, show: true },
    { key: "beta", labelKey: "settings.categoryBeta", icon: SparklesIcon, show: true },
    { key: "about", labelKey: "settings.categoryAbout", icon: InfoIcon, show: true },
  ]
  const effectiveCategory = categories.some((cat) => cat.key === category && cat.show) ? category : "appearance"

  return (
    <div className="oo-settings-scene relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--oo-surface)] p-4">
      <div className="relative flex h-[min(720px,calc(100vh-2.5rem))] min-h-0 w-[min(1040px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-[var(--oo-divider)] bg-background shadow-[0_16px_48px_rgba(0,0,0,0.16)]">
        <nav className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto rounded-l-2xl border-r border-[var(--oo-divider)] bg-[var(--oo-surface-raised)] px-2 py-4 max-[760px]:w-full max-[760px]:flex-row max-[760px]:overflow-x-auto max-[760px]:rounded-t-2xl max-[760px]:rounded-l-none max-[760px]:border-r-0 max-[760px]:border-b">
          {categories
            .filter((cat) => cat.show)
            .map((cat) => {
              const active = cat.key === effectiveCategory
              const Icon = cat.icon
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => onNavigateCategory(cat.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors md:w-full",
                    active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {t(cat.labelKey)}
                </button>
              )
            })}
        </nav>

        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--oo-divider)] px-4 py-2.5">
            {titlebarActions ? <div className="ml-auto flex shrink-0 items-center gap-1">{titlebarActions}</div> : null}
            <button
              type="button"
              onClick={onBack}
              aria-label={t("settings.backToApp")}
              title={t("settings.backToApp")}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-[var(--oo-surface-raised)] hover:text-foreground active:scale-[0.98]"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6 max-[760px]:px-4 max-[760px]:py-4">
            {effectiveCategory === "models" ? (
              <SettingsSection title={t("settings.categoryModels")}>
                <RuntimeProfileSummary mode={appSettings.settings.operatingMode} />
                <ModelSettings models={models} />
              </SettingsSection>
            ) : null}

            {effectiveCategory === "subagent" ? (
              <SettingsSection title={t("settings.categorySubagent")}>
                <SubagentModelSettings models={models} />
              </SettingsSection>
            ) : null}

            {effectiveCategory === "mcp" ? <McpServersSettings /> : null}

            {effectiveCategory === "memory" ? <MemorySettings /> : null}

            {effectiveCategory === "tools" ? <ToolsSettings /> : null}

            {effectiveCategory === "appearance" ? (
              <SettingsSection title={t("settings.groupAccount")}>
                <SettingsItem title={t("settings.theme")} icon={PaletteIcon}>
                  <PaletteSettings palette={preferencePalette} setPalette={setPreferencePalette} />
                </SettingsItem>
                <SettingsItem title={t("settings.appearance")} icon={MonitorIcon}>
                  <ThemeSettings preference={preference} setPreference={setPreference} />
                </SettingsItem>
                <SettingsItem title={t("settings.language")} icon={GlobeIcon}>
                  <LanguageSettings locale={locale} setLocale={setLocale} />
                </SettingsItem>
              </SettingsSection>
            ) : null}

            {effectiveCategory === "browser" ? (
              <SettingsSection title={t("settings.groupBrowser")}>
                <BrowserSettings
                  enabled={appSettings.settings.browserEnabled}
                  loading={appSettings.loading}
                  onEnabledChange={appSettings.setBrowserEnabled}
                />
              </SettingsSection>
            ) : null}

            {effectiveCategory === "notifications" ? (
              <SettingsSection title={t("settings.categoryNotifications")}>
                <NotificationSettings
                  capability={attention.notificationCapability}
                  loading={appSettings.loading}
                  settings={appSettings.settings}
                  onConditionChange={appSettings.setCompletionNotificationCondition}
                  onSoundChange={appSettings.setNotificationSoundEnabled}
                  onOpenSystemSettings={attention.openSystemNotificationSettings}
                  onBadgeChange={appSettings.setUnreadBadgeEnabled}
                  onTest={attention.testCompletionNotification}
                />
              </SettingsSection>
            ) : null}

            {effectiveCategory === "storage" ? (
              <SettingsSection title={t("settings.categoryStorage")}>
                <StorageSettings
                  currentDirectory={appSettings.settings.dataDirectory}
                  defaultDirectory={appSettings.settings.dataDirectoryDefault}
                  loading={appSettings.loading}
                  onChange={appSettings.setDataDirectory}
                />
              </SettingsSection>
            ) : null}

            {effectiveCategory === "usage" ? <UsageStatsSettings /> : null}

            {effectiveCategory === "about" ? (
              <SettingsSection title={t("settings.categoryAbout")}>
                <AboutSettings update={update} />
                <SettingsItem
                  title={t("settings.updateChannel")}
                  description={t("settings.channelHint")}
                  icon={RefreshCwIcon}
                >
                  <UpdateChannelSettings update={update} />
                </SettingsItem>
              </SettingsSection>
            ) : null}

            {effectiveCategory === "beta" ? (
              <SettingsSection title={t("settings.groupBetaFeatures")}>
                <SettingsItem
                  title={t("settings.knowledgeBeta")}
                  description={t("settings.knowledgeBetaDescription")}
                  icon={SparklesIcon}
                >
                  <KnowledgeBetaToggle
                    enabled={appSettings.settings.knowledgeBaseBetaEnabled}
                    loading={appSettings.loading}
                    onChange={appSettings.setKnowledgeBaseBetaEnabled}
                  />
                </SettingsItem>
              </SettingsSection>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

import type { ThemePalette, ThemePreference } from "@/components/theme-context"
import type { Locale } from "@/i18n/i18n"

import { Check, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

const themeOptions = [
  { value: "light", labelKey: "settings.themeLight", icon: SunIcon },
  { value: "dark", labelKey: "settings.themeDark", icon: MoonIcon },
  { value: "system", labelKey: "settings.themeSystem", icon: MonitorIcon },
] as const

const localeOptions: Array<{ value: Locale; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
]

/** 主题色板选项：默认（蓝紫）/ 暖阳（琥珀橙）/ 森林（绿）/ 暖色护眼（暖黄）/ 海洋（青蓝）。色块用于选择器预览。 */
const paletteOptions: Array<{
  value: ThemePalette
  labelKey:
    | "settings.paletteDefault"
    | "settings.paletteSunset"
    | "settings.paletteForest"
    | "settings.paletteEyecare"
    | "settings.paletteOcean"
  swatches: string[]
}> = [
  {
    value: "default",
    labelKey: "settings.paletteDefault",
    swatches: ["oklch(0.241 0.01 249)", "oklch(0.52 0.17 255)", "oklch(0.956 0.004 287)"],
  },
  {
    value: "sunset",
    labelKey: "settings.paletteSunset",
    swatches: ["oklch(0.52 0.14 50)", "oklch(0.6 0.15 55)", "oklch(0.985 0.01 75)"],
  },
  {
    value: "forest",
    labelKey: "settings.paletteForest",
    swatches: ["oklch(0.45 0.11 155)", "oklch(0.55 0.12 150)", "oklch(0.985 0.012 140)"],
  },
  {
    value: "eyecare",
    labelKey: "settings.paletteEyecare",
    swatches: ["oklch(0.48 0.1 60)", "oklch(0.55 0.1 60)", "oklch(0.972 0.028 85)"],
  },
  {
    value: "ocean",
    labelKey: "settings.paletteOcean",
    swatches: ["oklch(0.45 0.13 235)", "oklch(0.52 0.13 235)", "oklch(0.992 0.01 230)"],
  },
]

/** 主题色板选择（独立于外观明暗）。 */
export function PaletteSettings({
  palette,
  setPalette,
}: {
  palette: ThemePalette
  setPalette: (palette: ThemePalette) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-1.5">
      {paletteOptions.map((option) => {
        const active = palette === option.value
        return (
          <button
            key={option.value}
            type="button"
            title={t(option.labelKey)}
            aria-pressed={active}
            aria-label={t(option.labelKey)}
            onClick={() => setPalette(option.value)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-xl border px-2.5 transition-all duration-150",
              active
                ? "border-ring bg-primary/5 shadow-sm"
                : "border-[var(--oo-divider)] hover:-translate-y-px hover:border-border hover:bg-muted hover:shadow-xs",
            )}
          >
            <span className="flex -space-x-1">
              {option.swatches.map((color, index) => (
                <span
                  key={index}
                  className="size-4 rounded-full border border-[var(--oo-divider)]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="oo-text-caption text-muted-foreground">{t(option.labelKey)}</span>
            {active ? <Check className="size-3.5 text-primary" strokeWidth={3} /> : null}
          </button>
        )
      })}
    </div>
  )
}

export function ThemeSettings({
  preference,
  setPreference,
}: {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}) {
  const { t } = useI18n()
  return (
    <ToggleGroup
      type="single"
      value={preference}
      onValueChange={(value) => {
        if (value) {
          setPreference(value as ThemePreference)
        }
      }}
      variant="segmented"
      spacing={1}
      size="sm"
      className="flex-wrap"
    >
      {themeOptions.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          <option.icon className="size-4" />
          {t(option.labelKey)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function LanguageSettings({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={locale}
      onValueChange={(value) => {
        if (value) {
          setLocale(value as Locale)
        }
      }}
      variant="segmented"
      spacing={1}
      size="sm"
      className="flex-wrap"
    >
      {localeOptions.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

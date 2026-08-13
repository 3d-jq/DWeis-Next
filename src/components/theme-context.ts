import * as React from "react"
import { storageKey } from "../../electron/branding.ts"

export type ThemePreference = "system" | "light" | "dark"
export type EffectiveTheme = "light" | "dark"

/**
 * 主题色板：default = DWeis 默认（蓝紫），sunset = 暖阳（琥珀/橙），
 * forest = 森林（绿），eyecare = 暖色护眼（暖黄纸感，低对比），ocean = 海洋（青蓝冷调）。
 */
export type ThemePalette = "default" | "sunset" | "forest" | "eyecare" | "ocean"

export const themeStorageKey = storageKey("theme")
export const themePaletteStorageKey = storageKey("theme-palette")

export interface ThemeContextValue {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  effectiveTheme: EffectiveTheme
  palette: ThemePalette
  setPalette: (palette: ThemePalette) => void
}

export const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark"
}

export function isThemePalette(value: string | null): value is ThemePalette {
  return value === "default" || value === "sunset" || value === "forest" || value === "eyecare" || value === "ocean"
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return ctx
}

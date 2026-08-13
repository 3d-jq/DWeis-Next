export type SettingsCategory =
  | "models"
  | "subagent"
  | "mcp"
  | "memory"
  | "appearance"
  | "browser"
  | "notifications"
  | "storage"
  | "usage"
  | "tools"
  | "about"
  | "beta"

export type AppShellRoute =
  | "archived"
  | "automation"
  | "billing"
  | "chat"
  | "knowledge"
  | "skills"
  | "settings"
  | `settings/${SettingsCategory}`

export type InterfaceMode = "office" | "coding";

export const INTERFACE_MODE_STORAGE_KEY = "dweis-interface-mode";

export function normalizeInterfaceMode(value: unknown): InterfaceMode {
  // 独立新产品的首个版本没有历史存量值；未知值一律 fail-safe 回退 coding。
  return value === "office" ? "office" : "coding";
}

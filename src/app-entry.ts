export type AppEntryState = "app" | "fallback" | "loading"

/** 纯本地 self-managed 应用：无需身份，runtime 就绪即进入主界面。 */
export function resolveAppEntryState({
  runtimeReady,
  runtimeFailed,
}: {
  runtimeReady: boolean
  runtimeFailed: boolean
}): AppEntryState {
  if (!runtimeReady && !runtimeFailed) return "loading"
  return runtimeReady ? "app" : "fallback"
}

/**
 * DWeis Next：品牌图标主题判定（不依赖 React 上下文）。
 *
 * StoreProvider 之外的组件（启动阻塞态、标题栏、引导欢迎页、侧栏收起态按钮、
 * 欢迎页登录面板）也会渲染品牌图标。这些位置直接调 useZCodeStore 会在
 * StoreProvider 缺失时抛 "useZCodeStore 必须在 StoreProvider 内使用"，
 * 因此这里按 useTheme 同一规则读 localStorage 做渲染期快照判定：
 *   dark/zai-dark → 深色；system 且系统深色 → 深色；其余（含未知值）→ 亮色。
 * 主题切换后这些非 Provider 区域要等下一次渲染才跟随，与启动阻塞态的短暂
 * 展示窗口相比可接受。
 */

export function resolveLogoThemeFromStorage(): "dark" | "light" {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("dweis-theme");
  } catch {
    return "light";
  }
  if (saved === "dark" || saved === "zai-dark") return "dark";
  if (saved === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** 主题化品牌图标地址：亮色/默认=白方块+深标志，深色=黑方块+白笔画。 */
export function resolveBrandLogoSrc(): string {
  return resolveLogoThemeFromStorage() === "dark"
    ? new URL("../assets/provider-icons/logo-dweis-tile-dark.svg", import.meta.url).href
    : new URL("../assets/provider-icons/logo-dweis-tile-light.svg", import.meta.url).href;
}

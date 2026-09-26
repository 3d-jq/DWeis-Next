import type { ReactNode } from "react";
import dweisLogoUrl from "@/assets/provider-icons/logo-dweis.svg";
import { cn } from "@/components/lib/utils.js";

interface RootStartupLoadingProps {
  label: string;
  children?: ReactNode;
  busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
  return (
    <div
      // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
      // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
      className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-busy={busy}
      aria-label={label}
      data-testid="root-startup-loading"
    >
      <DWeisStartupLogoBadge />
      {children}
    </div>
  );
}

/** 初始化与引导共用品牌图标：owl 源图自带圆角与透明边缘，直接呈现，不套深色壳。 */
export function DWeisStartupLogoBadge() {
  return (
    <img
      src={dweisLogoUrl}
      alt="DWeis Next"
      draggable={false}
      className={cn("size-24 shrink-0 select-none rounded-3xl")}
    />
  );
}

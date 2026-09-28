import { cn } from "@/components/lib/utils.js";
import logoTileDark from "@/assets/provider-icons/logo-dweis-tile-dark.svg";
import logoTileLight from "@/assets/provider-icons/logo-dweis-tile-light.svg";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";

export function WindowsTopLeftLogo({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  // DWeis Next：标题栏品牌图标按主题双形态（亮色/默认=白方块+深标志，深色=黑方块+白笔画）。
  const logoUrl =
    resolveTheme(useZCodeStore((s) => s.theme)) === "dark" ? logoTileDark : logoTileLight;
  return (
    <div
      className={cn(
        // Workspace 的左侧工具组从 1px 面板边框之后开始，Settings 旧标题层却从窗口 0 点开始，
        // Workspace 的 logo 位于 28px 按钮内，图像相对按钮左沿还有 4px 居中留白；
        // Settings 直接渲染 20px 图像，不能拿按钮容器的 left 13px 当作图像坐标。
        // 计入 4px 外层留白、1px 边框和按钮内 4px 后，两处图像均为 left 17px / top 19px。
        "absolute left-1 top-1 mt-px ml-px z-20 flex h-12 items-center px-3 [app-region:drag]",
        className,
      )}
    >
      <img
        src={logoUrl}
        alt="DWeis Next"
        className={cn("pointer-events-none size-5 select-none", imageClassName)}
        draggable={false}
      />
    </div>
  );
}

import * as React from "react"
import { createPortal } from "react-dom"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

export interface ChatNavRailItem {
  turnId: string
  /** 悬停提示文案（用户消息文本；空时显示占位标题）。 */
  label: string
}

interface ChatNavRailProps {
  items: ChatNavRailItem[]
  /** StickToBottom 滚动容器（延迟解析：挂载后才存在）。 */
  getScrollElement: () => HTMLElement | null
}

const RAIL_LINE_MAX_PX = 16
const RAIL_LINE_MIN_PX = 5
/** 视口顶部以下多少像素内的轮次视为"当前轮次"。 */
const ACTIVE_TURN_TOP_OFFSET_PX = 96
/** 滚动距离超过该值用瞬时滚动，否则平滑（对齐 LobsterAI 导航决策）。 */
const SMOOTH_SCROLL_MAX_DISTANCE_PX = 800

function railLineWidth(distance: number): number {
  return Math.max(RAIL_LINE_MIN_PX, RAIL_LINE_MAX_PX - distance * 4)
}

/**
 * 对话轮次导航栏（对齐 LobsterAI Turn Navigation Rail，放在对话区左缘）：
 * 每轮对话一根横线，点击/上下箭头快速定位到该轮；活动横线跟随视口，悬停显示该轮摘要。
 */
export function ChatNavRail({ items, getScrollElement }: ChatNavRailProps) {
  const t = useT()
  const [visible, setVisible] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const [railHovered, setRailHovered] = React.useState(false)
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)
  const [tooltip, setTooltip] = React.useState<{ index: number; left: number; top: number } | null>(null)

  const findTurnElement = (turnId: string): HTMLElement | null => {
    const container = getScrollElement()
    if (!container) {
      return null
    }
    for (const element of container.querySelectorAll<HTMLElement>("[data-chat-turn-id]")) {
      if (element.dataset.chatTurnId === turnId) {
        return element
      }
    }
    return null
  }

  const measure = React.useCallback((): void => {
    const container = getScrollElement()
    if (!container) {
      return
    }
    const scrollable = container.scrollHeight > container.clientHeight + 4
    if (!scrollable) {
      setVisible(false)
      return
    }
    const containerTop = container.getBoundingClientRect().top
    let next = -1
    for (const element of container.querySelectorAll<HTMLElement>("[data-chat-turn-id]")) {
      if (element.getBoundingClientRect().top - containerTop <= ACTIVE_TURN_TOP_OFFSET_PX) {
        next += 1
        continue
      }
      break
    }
    setVisible(true)
    setActiveIndex(next)
  }, [getScrollElement])

  React.useEffect(() => {
    const container = getScrollElement()
    if (!container) {
      return
    }
    measure()
    let frame: number | null = null
    const handleScroll = (): void => {
      if (frame !== null) {
        return
      }
      frame = window.requestAnimationFrame(() => {
        frame = null
        measure()
      })
    }
    container.addEventListener("scroll", handleScroll, { passive: true })
    const observer = new ResizeObserver(handleScroll)
    observer.observe(container)
    return () => {
      container.removeEventListener("scroll", handleScroll)
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
      observer.disconnect()
    }
  }, [getScrollElement, items, measure])

  const navigateToIndex = (index: number): void => {
    const item = items[index]
    if (!item) {
      return
    }
    const container = getScrollElement()
    const element = findTurnElement(item.turnId)
    if (!container || !element) {
      return
    }
    const distance = Math.abs(element.getBoundingClientRect().top - container.getBoundingClientRect().top)
    element.scrollIntoView({
      behavior: distance > SMOOTH_SCROLL_MAX_DISTANCE_PX ? "auto" : "smooth",
      block: "start",
    })
    setActiveIndex(index)
  }

  const resolvedActiveIndex = activeIndex < 0 ? items.length - 1 : activeIndex

  if (items.length <= 1 || !visible) {
    return null
  }

  return (
    <div
      role="navigation"
      aria-label={t("chat.navRailAria")}
      className="absolute top-1/2 left-1 z-10 flex -translate-y-1/2 flex-col items-start"
      style={{ maxHeight: "calc(100% - 40px)" }}
      onMouseEnter={() => setRailHovered(true)}
      onMouseLeave={() => {
        setRailHovered(false)
        setHoveredIndex(null)
        setTooltip(null)
      }}
    >
      <button
        type="button"
        aria-label={t("chat.navRailPrev")}
        title={t("chat.navRailPrev")}
        onClick={() => navigateToIndex(Math.max(0, resolvedActiveIndex - 1))}
        onMouseEnter={() => setHoveredIndex(null)}
        className={cn(
          "mb-2 -ml-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
          !railHovered && "pointer-events-none opacity-0",
          railHovered && resolvedActiveIndex <= 0 && "cursor-default opacity-30",
        )}
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="size-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>
      <div className="max-h-[calc(100%-56px)] min-h-0 [scrollbar-width:none] overflow-y-auto overscroll-contain">
        {items.map((item, index) => {
          const isActive = index === resolvedActiveIndex
          const isHighlighted = hoveredIndex ?? isActive
          return (
            <button
              key={item.turnId}
              type="button"
              aria-label={item.label || t("chat.navRailTurn", { index: index + 1 })}
              aria-current={isActive ? "true" : undefined}
              title={item.label || t("chat.navRailTurn", { index: index + 1 })}
              className="flex w-5 cursor-pointer items-center justify-start py-[5px]"
              onClick={() => navigateToIndex(index)}
              onMouseEnter={(event) => {
                setHoveredIndex(index)
                const rect = event.currentTarget.getBoundingClientRect()
                setTooltip({
                  index,
                  left: Math.round(rect.right + 8),
                  top: Math.round(Math.max(8, Math.min(rect.top + rect.height / 2, window.innerHeight - 8))),
                })
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <span
                className={cn(
                  "block shrink-0 border-solid transition-[width,border-color]",
                  isHighlighted ? "border-foreground/80" : "border-muted-foreground/40",
                )}
                style={{
                  width: railLineWidth(isHighlighted ? 0 : Math.abs(index - resolvedActiveIndex)),
                  height: 0,
                  borderTopWidth: 2,
                }}
              />
            </button>
          )
        })}
      </div>
      <button
        type="button"
        aria-label={t("chat.navRailNext")}
        title={t("chat.navRailNext")}
        onClick={() => navigateToIndex(Math.min(items.length - 1, resolvedActiveIndex + 1))}
        onMouseEnter={() => setHoveredIndex(null)}
        className={cn(
          "mt-2 -ml-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
          !railHovered && "pointer-events-none opacity-0",
          railHovered && resolvedActiveIndex >= items.length - 1 && "cursor-default opacity-30",
        )}
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="size-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {tooltip && items[tooltip.index]
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 max-w-[min(360px,45vw)] overflow-hidden rounded-xl border bg-popover px-3 py-2 shadow-md"
              style={{ left: tooltip.left, top: tooltip.top, transform: "translateY(-50%)" }}
            >
              <div className="oo-text-caption-compact line-clamp-2 break-all text-foreground">
                {items[tooltip.index].label || t("chat.navRailTurn", { index: tooltip.index + 1 })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

import * as React from "react"
import { createPortal } from "react-dom"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

export interface ChatNavRailItem {
  turnId: string
  /** 悬停提示标题（用户消息文本；空时显示占位标题）。 */
  label: string
  /** 悬停提示摘要（该轮助手回复文本节选）。 */
  summary: string
}

interface ChatNavRailProps {
  items: ChatNavRailItem[]
  /** StickToBottom 滚动容器（延迟解析：挂载后才存在）。 */
  getScrollElement: () => HTMLElement | null
}

/** 横线粗细与宽度（对齐 LobsterAI Turn Navigation Rail）。 */
const RAIL_LINE_HEIGHT = 3
const RAIL_LINE_DEFAULT_WIDTH = 8
const RAIL_LINE_ACTIVE_WIDTH = 28
/** 悬停时以鼠标为中心的起伏波形：距离 0/1/2/3 的横线宽度。 */
const RAIL_LINE_HOVER_STEPS = [28, 18, 13, 10] as const
/** 视口顶部以下多少像素内的轮次视为"当前轮次"。 */
const ACTIVE_TURN_TOP_OFFSET_PX = 96
/** 滚动距离超过该值用瞬时滚动，否则平滑（对齐 LobsterAI 导航决策）。 */
const SMOOTH_SCROLL_MAX_DISTANCE_PX = 800

function getRailLineWidth(index: number, activeIndex: number, hoveredIndex: number | null): number {
  if (hoveredIndex !== null) {
    const hoverDistance = Math.abs(index - hoveredIndex)
    if (hoverDistance < RAIL_LINE_HOVER_STEPS.length) {
      return RAIL_LINE_HOVER_STEPS[hoverDistance]
    }
    return RAIL_LINE_DEFAULT_WIDTH
  }
  return index === activeIndex ? RAIL_LINE_ACTIVE_WIDTH : RAIL_LINE_DEFAULT_WIDTH
}

/**
 * 对话轮次导航栏（对齐 LobsterAI Turn Navigation Rail，放在对话区左缘）：
 * 每轮对话一根横线，悬停时横线宽度以鼠标为中心起伏；点击/上下箭头快速定位到该轮；
 * 活动横线跟随视口，悬停显示该轮用户消息 + 助手摘要。
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
  const tooltipItem = tooltip ? items[tooltip.index] : undefined

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
          const isHighlighted = hoveredIndex === null ? isActive : index === hoveredIndex
          return (
            <button
              key={item.turnId}
              type="button"
              aria-label={item.label || t("chat.navRailTurn", { index: index + 1 })}
              aria-current={isActive ? "true" : undefined}
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
                  isHighlighted ? "border-foreground" : "border-muted-foreground/50",
                )}
                style={{
                  width: getRailLineWidth(index, resolvedActiveIndex, hoveredIndex),
                  height: 0,
                  borderTopWidth: RAIL_LINE_HEIGHT,
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
      {tooltip && tooltipItem
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-[min(420px,45vw)] overflow-hidden rounded-xl border bg-popover px-3.5 py-2 shadow-md"
              style={{ left: tooltip.left, top: tooltip.top, transform: "translateY(-50%)" }}
            >
              <div className="oo-text-caption line-clamp-1 font-semibold break-all text-foreground">
                {tooltipItem.label || t("chat.navRailTurn", { index: tooltip.index + 1 })}
              </div>
              {tooltipItem.summary ? (
                <div className="oo-text-caption mt-1 line-clamp-2 break-all text-muted-foreground">
                  {tooltipItem.summary}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

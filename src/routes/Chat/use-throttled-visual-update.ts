/**
 * 帧节流的非关键视觉对齐调度（对齐 deepseek-harness useThrottledVisualUpdate）：
 * 滚动跟随等高频 DOM 调整合并到每 intervalFrames 帧执行一次，避免流式中每帧同步
 * 设置 scrollLeft 造成的横向跳动。
 */
import * as React from "react"

const DEFAULT_INTERVAL_FRAMES = 3

export function useThrottledVisualUpdate(update: () => void, intervalFrames = DEFAULT_INTERVAL_FRAMES): () => void {
  const updateRef = React.useRef(update)
  updateRef.current = update
  const pendingFrameRef = React.useRef<number | null>(null)

  React.useLayoutEffect(
    () => () => {
      if (pendingFrameRef.current === null) {
        return
      }
      cancelAnimationFrame(pendingFrameRef.current)
      pendingFrameRef.current = null
    },
    [],
  )

  return React.useCallback(() => {
    if (pendingFrameRef.current !== null) {
      return
    }
    let remainingFrames = intervalFrames
    const advance = (): void => {
      remainingFrames -= 1
      if (remainingFrames > 0) {
        pendingFrameRef.current = requestAnimationFrame(advance)
        return
      }
      pendingFrameRef.current = null
      updateRef.current()
    }
    pendingFrameRef.current = requestAnimationFrame(advance)
  }, [intervalFrames])
}

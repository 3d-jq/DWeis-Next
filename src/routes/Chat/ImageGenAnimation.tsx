/**
 * 图片生成中的动画预览（igCanvas：圆点网格 + 双圆光晕呼吸 + 标签扫光）。
 * 用于 generate_image 工具运行时的对话流展示，生成完成由产物缩略图接管。
 */
export function ImageGenAnimation({ prompt }: { prompt?: string }) {
  const displayPrompt = prompt && prompt.trim() ? prompt.trim() : "Generating image…"
  return (
    <div className="ig-wrap">
      <div className="ig-canvas" aria-hidden="true">
        <div className="ig-dots" />
        <div className="ig-glow" />
      </div>
      <span className="ig-res" aria-hidden="true">
        1024×1024
      </span>
      <div className="ig-meta">
        <span className="ig-label">正在生成图片</span>
        <span className="ig-prompt">{displayPrompt}</span>
      </div>
    </div>
  )
}

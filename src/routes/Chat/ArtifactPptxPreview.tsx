import * as React from "react"
import { useT } from "@/i18n/i18n"

interface SlideText {
  index: number
  text: string
}

const slideNamePattern = /^ppt\/slides\/slide(\d+)\.xml$/i

/**
 * PPTX 预览：jszip 解包后按 slide 顺序提取每页文本（OOXML a:t 元素），
 * 渲染为页面卡片列表。图片/形状/版式不渲染——聚焦内容可读性。
 */
export default function ArtifactPptxPreview({
  source,
  name: _name,
  onResourceError,
}: {
  source: string
  name: string
  onResourceError?: () => void
}) {
  const t = useT()
  const [slides, setSlides] = React.useState<SlideText[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      try {
        const [{ default: JSZip }, response] = await Promise.all([
          import("jszip"),
          fetch(source, { signal: controller.signal }),
        ])
        if (!response.ok) {
          throw new Error(`PPTX resource request failed with status ${response.status}`)
        }
        const zip = await JSZip.loadAsync(await response.arrayBuffer())
        const slideFiles = Object.values(zip.files)
          .filter((entry) => !entry.dir && slideNamePattern.test(entry.name))
          .sort((left, right) => {
            const li = Number(slideNamePattern.exec(left.name)?.[1] ?? 0)
            const ri = Number(slideNamePattern.exec(right.name)?.[1] ?? 0)
            return li - ri
          })
        const parser = new DOMParser()
        const extracted: SlideText[] = []
        for (const slide of slideFiles) {
          const xml = await slide.async("text")
          const doc = parser.parseFromString(xml, "application/xml")
          const texts: string[] = []
          doc.querySelectorAll("a\\:t, t").forEach((node) => {
            const value = node.textContent?.trim()
            if (value) {
              texts.push(value)
            }
          })
          const index = Number(slideNamePattern.exec(slide.name)?.[1] ?? 0)
          extracted.push({ index, text: texts.join("\n") })
        }
        if (cancelled) {
          return
        }
        setSlides(extracted)
      } catch (cause) {
        if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause))
          onResourceError?.()
        }
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [onResourceError, source])

  if (error) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-8 text-center">
        <div className="oo-text-body text-muted-foreground">{t("artifacts.previewUnavailable")}</div>
      </div>
    )
  }

  if (!slides) {
    return (
      <div className="oo-text-body flex min-h-full items-center justify-center px-4 py-8 text-muted-foreground">
        {t("artifacts.previewLoading")}
      </div>
    )
  }

  if (slides.length === 0) {
    return (
      <div className="oo-text-body flex min-h-full items-center justify-center px-4 py-8 text-muted-foreground">
        {t("artifacts.previewEmpty")}
      </div>
    )
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-3 overflow-y-auto bg-[var(--oo-artifact-preview-canvas)] p-3">
      <div className="oo-text-caption-compact px-1 text-muted-foreground">
        {t("artifacts.pptxSlideCount", { count: slides.length })}
      </div>
      {slides.map((slide) => (
        <div
          key={slide.index}
          className="overflow-hidden rounded-lg border border-[var(--oo-divider)] bg-background"
        >
          <div className="oo-border-divider flex items-center gap-2 border-b px-3 py-1.5">
            <span className="oo-text-caption-compact font-medium text-foreground">
              {t("artifacts.pptxSlide")} {slide.index}
            </span>
          </div>
          <div className="whitespace-pre-wrap px-3 py-2 text-sm leading-6 text-foreground/90">
            {slide.text || t("artifacts.pptxSlideEmpty")}
          </div>
        </div>
      ))}
    </div>
  )
}

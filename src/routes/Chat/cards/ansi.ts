/**
 * 极简 SGR ANSI 解析：仅支持工具输出常见的颜色与加粗控制序列，
 * 不解析 OSC/光标/8-bit 颜色——够 bash 终端显示用。
 *
 * 颜色采用 Tailwind 主题色（var(--dsw-*））而非 raw ANSI 16 色，
 * 输出在深/浅主题下都自然融入对话。bold 通过 CSS font-weight 处理（由调用方映射）。
 */

import { cn } from "@/lib/utils"

export type AnsiColor = "fg" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "gray"

export interface AnsiSpan {
  text: string
  fg: AnsiColor
  bold: boolean
}

/** 0=reset, 1=bold, 30-37/90-97=fg, 39=default fg, 40-47/100-107=bg(忽略) */
const colorMap: Record<number, AnsiColor> = {
  30: "fg",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  90: "fg",
  91: "red",
  92: "green",
  93: "yellow",
  94: "blue",
  95: "magenta",
  96: "cyan",
  97: "white",
}

const FG_CLASS: Record<AnsiColor, string> = {
  fg: "text-foreground",
  red: "text-red-500 dark:text-red-400",
  green: "text-emerald-600 dark:text-emerald-400",
  yellow: "text-amber-600 dark:text-amber-400",
  blue: "text-sky-600 dark:text-sky-400",
  magenta: "text-fuchsia-600 dark:text-fuchsia-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  white: "text-foreground",
  gray: "text-muted-foreground",
}

/** 解析一整段终端输出为行 + 行内 span 序列。含 ANSI 转义码的连续行也正确拆分。 */
export function parseAnsi(input: string): AnsiSpan[][] {
  const lines: AnsiSpan[][] = []
  let current: AnsiSpan[] = []
  let buffer = ""
  let fg: AnsiColor = "fg"
  let bold = false

  const flush = (): void => {
    if (buffer.length > 0) {
      current.push({ text: buffer, fg, bold })
      buffer = ""
    }
  }
  const pushLine = (): void => {
    flush()
    lines.push(current)
    current = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    // ESC[...m SGR
    if (char === "\x1b" && input[index + 1] === "[" && input[index + 2] === "?") {
      // 私有模式序列（\x1b[?25h 等），跳过到下一个字母
      let end = index + 3
      while (end < input.length && !/[a-zA-Z]/u.test(input[end] ?? "")) {
        end += 1
      }
      if (end < input.length) {
        index = end
        continue
      }
    }
    if (char === "\x1b" && input[index + 1] === "[") {
      const end = input.indexOf("m", index + 2)
      if (end < 0) {
        break
      }
      const body = input.slice(index + 2, end)
      flush()
      const codes = body.split(";").map((segment) => Number(segment))
      for (const code of codes) {
        if (code === 0) {
          fg = "fg"
          bold = false
        } else if (code === 1) {
          bold = true
        } else if (code === 22) {
          bold = false
        } else if (code === 39) {
          fg = "fg"
        } else if (code in colorMap) {
          fg = colorMap[code]!
        }
      }
      index = end
      continue
    }
    if (char === "\r") {
      continue
    }
    if (char === "\n") {
      pushLine()
      continue
    }
    buffer += char
  }
  pushLine()
  // 移除尾部全空行
  while (lines.length > 0 && lines.at(-1)?.every((span) => span.text === "")) {
    lines.pop()
  }
  return lines
}

export function ansiSpanClass(span: AnsiSpan): string {
  return cn(FG_CLASS[span.fg], span.bold && "font-semibold")
}

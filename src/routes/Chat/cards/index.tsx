/**
 * 工具展开内容派发：按 part.tool 选择专门卡片（对齐 dsh 各类 Tool 渲染）。
 * bash→Terminal、read→ReadCard、edit→DiffCard、grep/glob→SearchCard、webfetch/dweis_websearch→WebCard。
 * 其余工具 fallback：通用 IN/OUT 卡（参数/结果/错误/元数据）。
 */
import type { ChatMessagePart } from "../../../../electron/chat/common.ts"
import { DiffCard } from "./DiffBlock.tsx"
import { ReadCard } from "./ReadBlock.tsx"
import { SearchCard } from "./SearchBlock.tsx"
import { TerminalCard } from "./TerminalBlock.tsx"
import { WebCard } from "./WebBlock.tsx"
import { useT } from "@/i18n/i18n"

function parseExitCodeSettled(output: string, auth: boolean): string | null {
  if (auth) {
    return null
  }
  const match = output.match(/(?:exit code|signal)\s*([A-Z0-9]+)/u)
  return match ? `exit ${match[1]}` : null
}

export function ToolCard({ part, running }: { part: ChatMessagePart; running: boolean }) {
  const t = useT()
  const output = part.output ?? ""
  const input = part.input ?? {}

  if (part.tool === "bash") {
    const command = typeof input.command === "string" ? input.command.split("\n").pop() ?? input.command : ""
    return (
      <TerminalCard
        command={command}
        output={output}
        running={running}
        settledLabel={parseExitCodeSettled(output, part.status === "error")}
        t={t}
      />
    )
  }
  if (part.tool === "read") {
    return <ReadCard output={output} t={t} />
  }
  if (part.tool === "edit") {
    return <DiffCard output={output} t={t} />
  }
  if (part.tool === "grep" || part.tool === "glob") {
    return <SearchCard output={output} t={t} />
  }
  if (part.tool === "webfetch" || part.tool === "dweis_websearch") {
    return <WebCard output={output} t={t} />
  }
  return null
}

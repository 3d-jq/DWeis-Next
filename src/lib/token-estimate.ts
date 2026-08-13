/**
 * token 估算：与 opencode 口径一致（@opencode-ai/core/util/token 的 CHARS_PER_TOKEN = 4），
 * 保证上下文明细的估算与压缩阈值判断同源。非精确 tokenizer（项目无 tiktoken 依赖），
 * 中文等 CJK 文本实际约 1.5-2 字符/token，此处统一按 4 字符/token 保守估算。
 */
export function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / 4))
}

export function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / 4))
}

export interface AgentRefreshSchedulerOptions {
  canRefresh: () => boolean
  isBusy: () => boolean
  isQuitting: () => boolean
  refresh: (reason: string) => Promise<void>
}

/**
 * 运行时配置变更后延迟重启 Agent；正在运行 generation 时保持 pending，绝不静默打断任务。
 *
 * 冷却机制：一次重启完成后 REFRESH_COOLDOWN_MS 内的所有变更事件合并为一次待重启——
 * 技能目录 watcher / 模型事件等高频触发源（外部工具写技能根、opencode 扫描 touch 等）
 * 不会造成"启动 → 事件 → 重启 → 再启动"的重启风暴。
 */
export class AgentRefreshScheduler {
  private pending: NodeJS.Timeout | undefined
  /** 最近一次执行重启的时刻（0 = 从未重启，不受冷却约束）。 */
  private lastRefreshAt = 0
  private readonly options: AgentRefreshSchedulerOptions
  /** 重启冷却窗口：该窗口内的变更只合并等待，到期才执行下一次重启。 */
  private static readonly REFRESH_COOLDOWN_MS = 15_000

  public constructor(options: AgentRefreshSchedulerOptions) {
    this.options = options
  }

  public schedule(reason: string, delayMs = 1_500): void {
    if (this.options.isQuitting()) return
    if (this.pending) clearTimeout(this.pending)
    // 冷却期内（上次重启刚完成）：把下一次重启推迟到冷却结束，合并风暴中的多次变更。
    const cooldownRemaining =
      this.lastRefreshAt > 0
        ? Math.max(0, this.lastRefreshAt + AgentRefreshScheduler.REFRESH_COOLDOWN_MS - Date.now())
        : 0
    const effectiveDelay = Math.max(delayMs, cooldownRemaining)
    this.pending = setTimeout(() => {
      this.pending = undefined
      this.refresh(reason)
    }, effectiveDelay)
    this.pending.unref()
  }

  public dispose(): void {
    if (this.pending) clearTimeout(this.pending)
    this.pending = undefined
  }

  private refresh(reason: string): void {
    if (this.options.isQuitting()) return
    if (!this.options.canRefresh()) {
      this.schedule(reason, 2_000)
      return
    }
    if (this.options.isBusy()) {
      this.schedule(reason, 2_000)
      return
    }
    this.lastRefreshAt = Date.now()
    void this.options.refresh(reason).catch((error: unknown) => {
      console.error("[dweis] failed to restart agent after runtime configuration change:", { error, reason })
    })
  }
}

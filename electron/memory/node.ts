import type { MemoryContent, MemoryService } from "./common.ts"
import type { MemoryStore } from "./store.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { logDiagnostic } from "../diagnostics-log.ts"
import { MemoryService as MemoryServiceName } from "./common.ts"

export interface MemoryServiceDeps {
  store: MemoryStore
}

export class MemoryServiceImpl extends ConnectionService<MemoryService> implements IConnectionService<MemoryService> {
  private readonly deps: MemoryServiceDeps
  private mutationQueue: Promise<void> = Promise.resolve()

  public constructor(deps: MemoryServiceDeps) {
    super(MemoryServiceName)
    this.deps = deps
  }

  public async getMemory(): Promise<MemoryContent> {
    const [agent, user] = await Promise.all([this.deps.store.readAgent(), this.deps.store.readUser()])
    return { agent, user }
  }

  public updateMemory(patch: Partial<MemoryContent>): Promise<MemoryContent> {
    return this.enqueueMutation(async () => {
      const current = await this.getMemory()
      const next: MemoryContent = {
        agent: patch.agent ?? current.agent,
        user: patch.user ?? current.user,
      }
      const writes: Array<Promise<void>> = []
      if (patch.agent !== undefined) {
        writes.push(this.deps.store.writeAgent(next.agent))
      }
      if (patch.user !== undefined) {
        writes.push(this.deps.store.writeUser(next.user))
      }
      await Promise.all(writes)
      this.emitMemory(next)
      return next
    })
  }

  private emitMemory(content: MemoryContent): void {
    try {
      this.send("memoryChanged", content)
    } catch (error) {
      logDiagnostic("memory", "failed to broadcast memoryChanged", { error }, "warn")
    }
  }

  private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(mutation, mutation)
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

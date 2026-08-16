import type { OoCommandResult } from "../oo-command.ts"
import type {
  DeleteSkillRequest,
  OpenSkillPathRequest,
  SkillDocument,
  SkillDocumentRequest,
  SkillInventory,
  SkillInventoryChangedEvent,
  SkillService,
} from "./common.ts"
import type { SkillDeleteStoreTarget } from "./delete-plan.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { app, shell } from "electron"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { buildOoMaintenanceEnv } from "../agent/oo.ts"
import { resolveAgentSkillRoot, supportedAgents } from "../agents/catalog.ts"
import { logDiagnostic, logDiagnosticOnChange } from "../diagnostics-log.ts"
import { runOoCommand } from "../oo-command.ts"
import { resolveOoStoreDirectory } from "../oo-store-paths.ts"
import { ServiceEvent } from "../service-events.ts"
import { assertSkillOperationSucceeded, createDeleteSkillArgs } from "./actions.ts"
import {
  resolveAllowedSkillDocumentPath as resolveAllowedDocumentPath,
  resolveAllowedSkillPath as resolveAllowedPath,
} from "./allowed-path.ts"
import { SkillService as SkillServiceName } from "./common.ts"
import { buildLocalMachineSkillDeletePlan } from "./delete-plan.ts"
import { ExternalSkillRuntimeSynchronizer } from "./external-runtime-sync.ts"
import { normalizeSkillId, removeSkillDirectoryIfSafe } from "./file-operations.ts"
import { SkillFileWatcher } from "./file-watcher.ts"
import { SkillInventoryCache } from "./inventory-cache.ts"
import { mergeInstalledSkillSnapshots, readSkillCoverageAgents } from "./inventory-snapshot.ts"
import { buildSummary, groupInstalledSkills } from "./inventory.ts"
import { areManifestStoresEqual, readManifestStore, upsertManifestRecords, writeManifestStore } from "./manifest.ts"
import { isSkillRemovedByUser, RemovedSkillStore, upsertRemovedSkillRecord } from "./removed-store.ts"
import { scanInstalledSkills, scanDWeisInstalledSkills } from "./scan.ts"

interface SkillServiceOptions {
  onRuntimeSkillsChanged?: (reason: string) => void
}

export class SkillServiceImpl extends ConnectionService<SkillService> implements IConnectionService<SkillService> {
  private readonly fileWatcher: SkillFileWatcher
  private readonly inventoryCache = new SkillInventoryCache()
  private readonly externalRuntimeSynchronizer: ExternalSkillRuntimeSynchronizer
  private skillMutationQueue: Promise<void> = Promise.resolve()
  private runtimeSyncQueue: Promise<void> = Promise.resolve()
  private removedSkillStore: RemovedSkillStore | undefined
  private readonly options: SkillServiceOptions
  private isDisposed = false
  public readonly inventoryChanged = new ServiceEvent<SkillInventoryChangedEvent>()

  public constructor(options: SkillServiceOptions = {}) {
    super(SkillServiceName)
    this.options = options
    this.fileWatcher = new SkillFileWatcher({
      onExternalRuntimeSync: () => this.syncExternalRuntimeSkillsAndNotify("external-skill-files-changed"),
      onFilesChanged: () => this.inventoryCache.invalidate(),
      onInventoryChanged: async () => {
        await this.emitInventoryChanged()
      },
      onRuntimeSkillsChanged: () => this.notifyRuntimeSkillsChanged("skill-files-changed"),
    })
    this.externalRuntimeSynchronizer = new ExternalSkillRuntimeSynchronizer({
      bundledSkillRoot: this.getBundledAgentSkillRoot(),
      manifestPath: this.getManifestPath(),
      sharedSkillRoot: this.getSharedAgentSkillRoot(),
    })
    if (app.isReady()) {
      this.startWatching()
    } else {
      void app.whenReady().then(() => {
        if (!this.isDisposed) {
          this.startWatching()
        }
      })
    }
  }

  private getManifestPath(): string {
    return path.join(app.getPath("userData"), "skills", "manifest.json")
  }

  private getRemovedSkillStore(): RemovedSkillStore {
    this.removedSkillStore ??= new RemovedSkillStore(app.getPath("userData"))
    return this.removedSkillStore
  }

  private getDWeisSkillStoreRoot(): string {
    return path.join(app.getPath("userData"), "agent", "oo-store", "config", "skills")
  }

  private getDWeisOoStoreRoot(): string {
    return path.join(app.getPath("userData"), "agent", "oo-store")
  }

  private getGlobalOoStoreRoot(): string {
    return resolveOoStoreDirectory()
  }

  private getGlobalRegistrySkillRoot(): string {
    return path.join(this.getGlobalOoStoreRoot(), "skills", "registry")
  }

  private getDWeisRegistrySkillRoot(): string {
    return path.join(this.getDWeisSkillStoreRoot(), "registry")
  }

  private getSharedAgentSkillRoot(): string {
    return path.join(app.getPath("userData"), "agent", "workspace", ".opencode", "skills")
  }

  private getBundledAgentSkillRoot(): string {
    return path.join(app.getPath("userData"), "agent", "workspace", ".opencode", "skill")
  }

  public async getSkillInventory(): Promise<SkillInventory> {
    return this.readSharedSkillInventory({ writeManifest: true })
  }

  public async openSkillFolder(request: OpenSkillPathRequest): Promise<void> {
    const skillPath = await this.resolveAllowedSkillPath(request.path)
    const error = await shell.openPath(skillPath)

    if (error) {
      throw new Error(error)
    }
  }

  public async readSkillDocument(request: SkillDocumentRequest): Promise<SkillDocument> {
    const skillFilePath = await this.resolveAllowedSkillDocumentPath(request.path)

    return {
      content: await readFile(skillFilePath, "utf8"),
      path: skillFilePath,
    }
  }

  public async openSkillDocument(request: SkillDocumentRequest): Promise<void> {
    const skillFilePath = await this.resolveAllowedSkillDocumentPath(request.path)
    const error = await shell.openPath(skillFilePath)

    if (error) {
      throw new Error(error)
    }
  }

  public async deleteSkill(request: DeleteSkillRequest): Promise<SkillInventory> {
    return this.enqueueSkillMutation(() => this.deleteSkillUnlocked(request))
  }

  private async deleteSkillUnlocked(request: DeleteSkillRequest): Promise<SkillInventory> {
    if (!request.confirmed) {
      throw new Error("Skill deletion requires confirmation.")
    }

    const skillId = normalizeSkillId(request.skillId)
    const inventory = await this.readSharedSkillInventory({ writeManifest: false })
    const group = inventory.groups.find((item) => item.id === skillId)

    if (!group) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    const plan = buildLocalMachineSkillDeletePlan({
      agentSkillRoots: this.readDeletableSkillRoots(),
      globalRegistrySkillRoot: this.getGlobalRegistrySkillRoot(),
      group,
      dweisRegistrySkillRoot: this.getDWeisRegistrySkillRoot(),
    })
    const uninstallErrors = await this.uninstallRegistrySkillFromStores(plan.storeTargets)
    const removedTargets = await this.deleteSkillPlanTargets(plan)
    const uninstallSucceeded = plan.storeTargets.length > uninstallErrors.length

    if (removedTargets === 0 && !uninstallSucceeded && uninstallErrors.length > 0) {
      throw uninstallErrors[0]
    }
    if (removedTargets === 0 && !uninstallSucceeded) {
      throw new Error(`No installed Skill target found: ${skillId}`)
    }

    if (group.kind === "registry") {
      await this.rememberRemovedSkill({
        packageName: group.packageName,
        skillId,
      })
    }
    this.notifyRuntimeSkillsChanged("delete-skill")

    return this.readAndPublishSkillInventory()
  }

  public override dispose(): void {
    this.isDisposed = true

    this.fileWatcher.dispose()
    super.dispose()
  }

  private startWatching(): void {
    if (this.isDisposed) {
      return
    }
    this.fileWatcher.start([
      { pathname: path.dirname(this.getManifestPath()), affectsRuntimeSkills: false, syncRuntimeSkills: false },
      { pathname: this.getSharedAgentSkillRoot(), affectsRuntimeSkills: true, syncRuntimeSkills: false },
      { pathname: this.getDWeisSkillStoreRoot(), affectsRuntimeSkills: false, syncRuntimeSkills: false },
      ...supportedAgents.map((agent) => ({
        pathname: resolveAgentSkillRoot(agent),
        affectsRuntimeSkills: false,
        syncRuntimeSkills: true,
      })),
    ])
  }

  private notifyRuntimeSkillsChanged(reason: string): void {
    this.options.onRuntimeSkillsChanged?.(reason)
  }

  private async syncExternalRuntimeSkillsAndNotify(reason: string): Promise<void> {
    const removedStore = await this.getRemovedSkillStore().read()
    const synced = await this.syncExternalAgentSkillsToRuntimeRoot(removedStore)
    if (!synced) {
      return
    }

    this.inventoryCache.invalidate()
    this.notifyRuntimeSkillsChanged(reason)
    await this.emitInventoryChanged()
  }

  private async emitInventoryChanged(): Promise<void> {
    const event: SkillInventoryChangedEvent = {
      updatedAt: new Date().toISOString(),
    }

    this.inventoryChanged.emit(event)
    await this.send("skillInventoryChanged", event)
  }

  private async syncExternalAgentSkillsToRuntimeRoot(
    removedStore: Awaited<ReturnType<RemovedSkillStore["read"]>>,
  ): Promise<boolean> {
    return this.enqueueRuntimeSync(() => this.externalRuntimeSynchronizer.sync(removedStore))
  }

  private enqueueRuntimeSync<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.runtimeSyncQueue.catch(() => undefined).then(operation)
    this.runtimeSyncQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private enqueueSkillMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.skillMutationQueue.catch(() => undefined).then(operation)
    this.skillMutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async rememberRemovedSkill(skill: { packageName?: string; skillId: string }): Promise<void> {
    const store = this.getRemovedSkillStore()
    await store.update((current) =>
      upsertRemovedSkillRecord(current, {
        packageName: skill.packageName?.trim() || undefined,
        removedAt: new Date().toISOString(),
        scope: "local-machine",
        skillId: normalizeSkillId(skill.skillId),
      }),
    )
  }

  private async uninstallRegistrySkillFromStores(targets: SkillDeleteStoreTarget[]): Promise<unknown[]> {
    const errors: unknown[] = []

    for (const target of targets) {
      try {
        const result = await this.runOoSkillStoreCommand(target, createDeleteSkillArgs({ skillId: target.skillId }))
        assertOoSkillOperationResult(result, "skills.uninstall")
      } catch (cause) {
        errors.push(cause)
        logDiagnostic(
          "skills",
          "registry skill uninstall failed during local-machine delete",
          {
            error: cause,
            packageName: target.packageName,
            skillId: target.skillId,
            store: target.kind,
          },
          "warn",
        )
      }
    }

    return errors
  }

  private async runOoSkillStoreCommand(
    target: Pick<SkillDeleteStoreTarget, "kind">,
    args: string[],
  ): Promise<OoCommandResult> {
    const globalStoreRoot = this.getGlobalOoStoreRoot()
    const env =
      target.kind === "global"
        ? buildOoMaintenanceEnv({
            configDir: globalStoreRoot,
            dataDir: path.join(globalStoreRoot, "data"),
            logDir: path.join(globalStoreRoot, "log"),
            ooBinPath: process.env["OO_CLI_PATH"],
          })
        : buildOoMaintenanceEnv({
            configDir: path.join(this.getDWeisOoStoreRoot(), "config"),
            dataDir: path.join(this.getDWeisOoStoreRoot(), "data"),
            logDir: path.join(this.getDWeisOoStoreRoot(), "log"),
            ooBinPath: process.env["OO_CLI_PATH"],
          })

    return runOoCommand(args, {
      env,
      rejectOnFailure: false,
    })
  }

  private async deleteSkillPlanTargets(plan: ReturnType<typeof buildLocalMachineSkillDeletePlan>): Promise<number> {
    const allowedRoots = [
      ...this.readDeletableSkillRoots(),
      this.getDWeisRegistrySkillRoot(),
      this.getGlobalRegistrySkillRoot(),
    ]
    let deletedTargets = 0

    for (const target of plan.targets) {
      const result = await removeSkillDirectoryIfSafe({
        allowedRoots,
        packageName: plan.packageName,
        path: target.path,
        skillId: plan.skillId,
      })

      if (result.status === "removed") {
        deletedTargets += 1
      } else if (result.reason !== "missing") {
        logDiagnostic(
          "skills",
          "skill delete target skipped",
          {
            path: result.path,
            reason: result.reason,
            skillId: plan.skillId,
            targetKind: target.kind,
          },
          "warn",
        )
      }
    }

    return deletedTargets
  }

  private readDeletableSkillRoots(): string[] {
    return [this.getSharedAgentSkillRoot(), ...supportedAgents.map((agent) => resolveAgentSkillRoot(agent))]
  }

  private async readAndPublishSkillInventory(): Promise<SkillInventory> {
    const inventory = await this.refreshSharedSkillInventory({ writeManifest: true })
    await this.emitInventoryChanged()
    return inventory
  }

  private async readSharedSkillInventory(options: { writeManifest: boolean }): Promise<SkillInventory> {
    return this.inventoryCache.get(options, (request) => this.readSkillInventory(request))
  }

  private async refreshSharedSkillInventory(options: { writeManifest: boolean }): Promise<SkillInventory> {
    return this.inventoryCache.refresh(options, (request) => this.readSkillInventory(request))
  }

  private async readSkillInventory(options: { writeManifest: boolean }): Promise<SkillInventory> {
    const startedAtMs = Date.now()
    const manifestPath = this.getManifestPath()
    const [dweisInstalledSkills, externalInstalledSkills, manifestStore, removedStore] = await Promise.all([
      scanDWeisInstalledSkills({
        cacheSkillStoreRoot: this.getDWeisSkillStoreRoot(),
        sharedSkillRoot: this.getSharedAgentSkillRoot(),
      }),
      scanInstalledSkills(),
      readManifestStore(manifestPath),
      this.getRemovedSkillStore().read(),
    ])
    const installedSkills = mergeInstalledSkillSnapshots(dweisInstalledSkills, externalInstalledSkills).filter(
      (skill) =>
        !isSkillRemovedByUser(removedStore, {
          packageName: skill.metadata.packageName,
          skillId: skill.name,
        }),
    )
    const nextManifestStore = upsertManifestRecords(manifestStore, installedSkills)
    const groups = groupInstalledSkills(installedSkills, nextManifestStore, readSkillCoverageAgents(installedSkills))

    if (options.writeManifest && !areManifestStoresEqual(manifestStore, nextManifestStore)) {
      await writeManifestStore(manifestPath, nextManifestStore)
    }

    const inventory = {
      groups,
      summary: buildSummary(groups),
      updatedAt: new Date().toISOString(),
    }
    const diagnosticFields = {
      durationMs: Date.now() - startedAtMs,
      groupCount: inventory.groups.length,
      installedSkillCount: installedSkills.length,
      managedSkillCount: inventory.summary.managedSkills,
      manifestPath,
      needsAttention: inventory.summary.needsAttention,
      registrySkillCount: inventory.summary.registrySkills,
      writeManifest: options.writeManifest,
    }
    logDiagnosticOnChange(
      "skill-service:inventory",
      "skill-service",
      "skill inventory read",
      diagnosticFields,
      "trace",
      {
        groupCount: diagnosticFields.groupCount,
        installedSkillCount: diagnosticFields.installedSkillCount,
        managedSkillCount: diagnosticFields.managedSkillCount,
        manifestPath: diagnosticFields.manifestPath,
        needsAttention: diagnosticFields.needsAttention,
        registrySkillCount: diagnosticFields.registrySkillCount,
      },
    )
    logDiagnostic("performance", "skill inventory scan", diagnosticFields, "trace")
    return inventory
  }

  private async resolveAllowedSkillPath(requestPath: string): Promise<string> {
    const inventory = await this.readSharedSkillInventory({ writeManifest: false })
    const allowedPaths = inventory.groups.flatMap((group) =>
      group.hosts.flatMap((host) => [host.path, host.sourcePath]),
    )
    return resolveAllowedPath(requestPath, allowedPaths)
  }

  private async resolveAllowedSkillDocumentPath(requestPath: string): Promise<string> {
    const inventory = await this.readSharedSkillInventory({ writeManifest: false })
    const allowedPaths = inventory.groups.flatMap((group) =>
      group.hosts.flatMap((host) => [host.path, host.sourcePath]),
    )
    return resolveAllowedDocumentPath(requestPath, allowedPaths)
  }
}

function assertOoSkillOperationResult(
  result: OoCommandResult,
  expectedCommand: Parameters<typeof assertSkillOperationSucceeded>[1],
): void {
  if (!result.ok && !result.stdout.trim()) {
    throw new Error(result.message ?? (result.stderr || "Skill operation failed."))
  }

  try {
    assertSkillOperationSucceeded(result.stdout, expectedCommand)
  } catch (cause) {
    if (!result.ok && cause instanceof SyntaxError) {
      throw new Error(result.message ?? (result.stderr || "Skill operation failed."))
    }

    throw cause
  }
}

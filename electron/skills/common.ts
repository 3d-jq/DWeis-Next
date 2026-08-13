import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

export type SkillControlState = "controlled" | "modified" | "source-missing" | "unknown"
export type ManagedSkillKind = "registry" | "local" | "unknown"
export type SkillHostStatus = "installed" | "missing"
export type SkillHostScope = "external" | "runtime"

export interface SkillSummaryItem {
  attentionHosts: number
  description?: string
  icon?: string
  id: string
  installedHosts: number
  kind: ManagedSkillKind
  modifiedHosts: number
  name: string
  packageName?: string
  publishableHosts: number
  sourceMissingHosts: number
  totalHosts: number
  unknownHosts: number
  version?: string
}

export interface SkillSummary {
  localSkills: number
  managedSkills: number
  modifiedHosts: number
  needsAttention: number
  publishableSkills: number
  registrySkills: number
  sourceMissingHosts: number
  skills: SkillSummaryItem[]
}

export interface ManagedSkillHostCoverage {
  agentId: string
  agentName: string
  kind?: ManagedSkillKind
  packageName?: string
  path?: string
  scope: SkillHostScope
  controlState?: SkillControlState
  sourcePath?: string
  status: SkillHostStatus
  version?: string
}

export interface ManagedSkillGroup {
  description?: string
  icon?: string
  id: string
  name: string
  kind: ManagedSkillKind
  packageName?: string
  version?: string
  externalHosts: ManagedSkillHostCoverage[]
  hosts: ManagedSkillHostCoverage[]
  runtimeHosts: ManagedSkillHostCoverage[]
}

export interface SkillInventory {
  groups: ManagedSkillGroup[]
  summary: SkillSummary
  updatedAt: string
}

export interface SkillInventoryChangedEvent {
  updatedAt: string
}

export interface OpenSkillPathRequest {
  path: string
}

export interface SkillDocumentRequest {
  path: string
}

export interface SkillDocument {
  content: string
  path: string
}

export interface DeleteSkillRequest {
  confirmed: boolean
  skillId: string
}

export type SkillService = typeof SkillService

export const SkillService = serviceName("skill-service") as ServiceName<{
  ServerEvents: {
    skillInventoryChanged: SkillInventoryChangedEvent
  }
  ClientInvokes: {
    getSkillInventory(): Promise<SkillInventory>
    deleteSkill(request: DeleteSkillRequest): Promise<SkillInventory>
    openSkillDocument(request: SkillDocumentRequest): Promise<void>
    openSkillFolder(request: OpenSkillPathRequest): Promise<void>
    readSkillDocument(request: SkillDocumentRequest): Promise<SkillDocument>
  }
}>

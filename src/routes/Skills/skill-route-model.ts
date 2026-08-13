import type { ManagedSkillGroup, ManagedSkillHostCoverage, ManagedSkillKind } from "../../../electron/skills/common.ts"
import type { ObjectStatusTone } from "@/components/ObjectRow"
import type { TranslateFn as TFunction } from "@/i18n"

import { cn } from "@/lib/utils"

export type SkillSelectionKey = string
export type InstalledSkillFilter = "all" | "dweis" | "codex" | "claude-code" | "local"
export type SkillDocumentViewMode = "preview" | "raw"

export function isInstalledSkillFilter(value: string): value is InstalledSkillFilter {
  return value === "all" || value === "dweis" || value === "codex" || value === "claude-code" || value === "local"
}

export function skillDocumentPreviewSource(content: string): string {
  const normalized = content.replace(/^\uFEFF/, "")
  if (!normalized.startsWith("---")) {
    return normalized
  }

  const lines = normalized.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") {
    return normalized
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (closingIndex < 0) {
    return normalized
  }

  return lines
    .slice(closingIndex + 1)
    .join("\n")
    .trimStart()
}

export function getRuntimeHosts(group: ManagedSkillGroup): ManagedSkillHostCoverage[] {
  return group.runtimeHosts
}

export function getInstalledPlatformHosts(group: ManagedSkillGroup): ManagedSkillHostCoverage[] {
  return getInstalledSkillHosts(group)
}

export function hasInstalledHostForAgent(group: ManagedSkillGroup, agentId: string): boolean {
  return getInstalledPlatformHosts(group).some((host) => host.agentId === agentId)
}

export function hasRuntimeInstalledHost(group: ManagedSkillGroup): boolean {
  return getInstalledPlatformHosts(group).some((host) => host.scope === "runtime")
}

export function hasExternalInstalledHost(group: ManagedSkillGroup): boolean {
  return getInstalledPlatformHosts(group).some((host) => host.scope === "external")
}

export function getInstalledSkillHosts(group: ManagedSkillGroup): ManagedSkillHostCoverage[] {
  return group.hosts.filter((host) => host.status === "installed")
}

export function getInstalledHostCount(group: ManagedSkillGroup, hosts = group.hosts): number {
  return hosts.filter((host) => host.status === "installed").length
}

export function getAttentionHostCount(group: ManagedSkillGroup, hosts = group.hosts): number {
  return hosts.filter((host) => host.controlState === "modified" || host.controlState === "source-missing").length
}

export function isInstalledSkillGroup(group: ManagedSkillGroup): boolean {
  return getInstalledSkillHosts(group).length > 0
}

export function getSelectedManagedSkillGroup(
  groups: readonly ManagedSkillGroup[],
  selectedId: SkillSelectionKey | null,
): ManagedSkillGroup | undefined {
  if (!selectedId) {
    return undefined
  }

  return groups.find((group) => group.id === selectedId)
}

export function getSkillDocumentRootPath(group: ManagedSkillGroup): string | undefined {
  const installedHost = getInstalledSkillHosts(group).find((host) => host.path || host.sourcePath)
  return installedHost?.path ?? installedHost?.sourcePath
}

export function matchesInstalledSkillFilter(group: ManagedSkillGroup, filter: InstalledSkillFilter): boolean {
  switch (filter) {
    case "all":
      return true
    case "dweis":
      return hasRuntimeInstalledHost(group)
    case "codex":
      return hasInstalledHostForAgent(group, "codex")
    case "claude-code":
      return hasInstalledHostForAgent(group, "claude-code")
    case "local":
      return group.kind === "local"
  }
}

export function getSkillKindLabel(kind: ManagedSkillKind, t: TFunction): string {
  switch (kind) {
    case "registry":
      return t("skills.kind.registry")
    case "local":
      return t("skills.kind.local")
    case "unknown":
      return t("skills.kind.unknown")
  }
}

export function getGroupStatus(group: ManagedSkillGroup, t: TFunction, hosts = group.hosts) {
  const attentionHostCount = getAttentionHostCount(group, hosts)
  const sourceMissingHostCount = hosts.filter((host) => host.controlState === "source-missing").length
  const modifiedHostCount = hosts.filter((host) => host.controlState === "modified").length
  const installedHostCount = getInstalledHostCount(group, hosts)

  if (attentionHostCount > 0) {
    const isDanger = sourceMissingHostCount > 0
    const tone: ObjectStatusTone = isDanger ? "danger" : "attention"

    return {
      badge: isDanger ? ("destructive" as const) : ("outline" as const),
      description: isDanger
        ? t("skills.groupStatus.sourceMissingDescription", { count: sourceMissingHostCount })
        : t("skills.groupStatus.modifiedDescription", { count: modifiedHostCount }),
      label: isDanger ? t("skills.groupStatus.sourceMissing") : t("skills.groupStatus.modified"),
      tone,
    }
  }

  if (installedHostCount === 0) {
    return {
      badge: "outline" as const,
      description: t("skills.groupStatus.notInstalledDescription"),
      label: t("skills.groupStatus.notInstalled"),
      tone: "pending" as const satisfies ObjectStatusTone,
    }
  }

  return {
    badge: "secondary" as const,
    label: undefined,
    tone: "ready" as const satisfies ObjectStatusTone,
  }
}

export function getHostStatus(host: ManagedSkillHostCoverage, t: TFunction) {
  if (host.status !== "installed") {
    return {
      label: t("skills.hostStatus.notInstalled"),
      tone: "pending" as const satisfies ObjectStatusTone,
      variant: "outline" as const,
    }
  }

  if (host.controlState === "modified") {
    return {
      label: t("skills.hostStatus.modified"),
      tone: "attention" as const satisfies ObjectStatusTone,
      variant: "outline" as const,
    }
  }

  if (host.controlState === "source-missing") {
    return {
      label: t("skills.hostStatus.sourceMissing"),
      tone: "danger" as const satisfies ObjectStatusTone,
      variant: "destructive" as const,
    }
  }

  return {
    label: undefined,
    tone: "ready" as const satisfies ObjectStatusTone,
    variant: "secondary" as const,
  }
}

export function shouldShowStatusBadge(statusTone: ObjectStatusTone): boolean {
  return statusTone !== "ready"
}

export function getStatusBadgeClassName(statusTone: ObjectStatusTone): string | undefined {
  if (statusTone !== "attention") {
    return undefined
  }

  return "border-[var(--oo-warning-border)] bg-[var(--oo-warning-surface)] text-[var(--oo-warning-foreground)]"
}

export function getGroupRowPackageLine(group: ManagedSkillGroup): string | undefined {
  const line = [group.packageName, group.version].filter(Boolean).join(" · ")

  return line || undefined
}

export function getSkillCreatorLine(group: ManagedSkillGroup, t: TFunction): string {
  const owner = getPackageOwner(group.packageName)
  if (owner) {
    return t("skills.createdByPackage", { owner })
  }

  if (group.kind === "local") {
    return t("skills.createdLocally")
  }

  return t("skills.createdUnknown")
}

export function getSkillPlatformLine(group: ManagedSkillGroup, t: TFunction): string {
  const installedHosts = getInstalledPlatformHosts(group)
  const hostNames = installedHosts.map((host) => host.agentName)

  if (hostNames.length === 0) {
    return t("skills.platform.none")
  }

  if (hostNames.length <= 2) {
    return t("skills.platform.list", { names: hostNames.join(", ") })
  }

  return t("skills.platform.count", { count: hostNames.length })
}

function getPackageOwner(packageName: string | undefined): string | undefined {
  const normalizedPackageName = packageName?.trim()
  if (!normalizedPackageName) {
    return undefined
  }

  if (normalizedPackageName.startsWith("@")) {
    return normalizedPackageName.slice(1).split("/")[0] || normalizedPackageName
  }

  return normalizedPackageName
}


export function isImageIcon(icon: string | undefined): boolean {
  return Boolean(icon?.startsWith("https://"))
}

export function isEmojiIcon(icon: string | undefined): boolean {
  const normalized = icon?.trim()
  return Boolean(normalized && !/^\d+$/.test(normalized) && !normalized.includes(":") && /\p{Emoji}/u.test(normalized))
}

export function getSkillRowStatusBadgeClassName(tone: ObjectStatusTone): string {
  const baseClassName = "oo-text-micro h-5 max-w-28 shrink-0 px-1.5 font-medium"

  if (tone === "attention") {
    return cn(
      baseClassName,
      "border-[var(--oo-warning-border)] bg-[var(--oo-warning-surface)] text-[var(--oo-warning-foreground)]",
    )
  }

  if (tone === "pending") {
    return cn(baseClassName, "border-[var(--oo-frame-border)] bg-muted/40 text-muted-foreground")
  }

  return baseClassName
}

import type { ManagedSkillGroup } from "../../../electron/skills/common.ts"
import type { ObjectStatusTone } from "@/components/ObjectRow"

import {
  getGroupRowPackageLine,
  getGroupStatus,
  getInstalledPlatformHosts,
  getRuntimeHosts,
  getSkillCreatorLine,
  getSkillKindLabel,
  getSkillPlatformLine,
  getSkillRowStatusBadgeClassName,
  hasExternalInstalledHost,
  hasRuntimeInstalledHost,
} from "./skill-route-model.ts"
import { SkillListRow } from "./SkillListRow.tsx"
import { SkillIconFrame, SkillPageScrollArea } from "./SkillUiParts.tsx"
import { AgentIcon } from "@/components/AgentIcon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAppI18n } from "@/i18n"

interface InstalledSkillsPaneProps {
  groups: ManagedSkillGroup[]
  onSelectSkill: (skillId: string) => void
  selectedSkill: ManagedSkillGroup | undefined
}

export function InstalledSkillsPane({ groups, onSelectSkill, selectedSkill }: InstalledSkillsPaneProps) {
  const { t } = useAppI18n()

  return (
    <SkillPageScrollArea>
      <div className="grid gap-3">
        {groups.length === 0 ? (
          <div className="oo-text-body oo-text-muted px-1 py-3">{t("skills.installedEmpty")}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--oo-divider)] bg-background shadow-sm">
            {groups.map((group) => (
              <InstalledSkillRow
                key={group.id}
                group={group}
                selected={selectedSkill?.id === group.id}
                onOpen={() => onSelectSkill(group.id)}
              />
            ))}
          </div>
        )}
      </div>
    </SkillPageScrollArea>
  )
}

interface InstalledSkillRowProps {
  group: ManagedSkillGroup
  onOpen: () => void
  selected: boolean
}

function InstalledSkillRow({ group, onOpen, selected }: InstalledSkillRowProps) {
  const { t } = useAppI18n()
  const status = getGroupStatus(group, t, getRuntimeHosts(group))
  const hasAttention = status.tone === "attention" || status.tone === "danger"
  const hasRuntimeHost = hasRuntimeInstalledHost(group)
  const hasExternalHost = hasExternalInstalledHost(group)
  const statusLabel = hasAttention
    ? (status.label ?? t("skills.groupStatus.modified"))
    : !hasRuntimeHost && hasExternalHost
      ? t("skills.externalInstalled")
      : t("skills.installed")
  const badgeTone: ObjectStatusTone = hasAttention
    ? status.tone
    : !hasRuntimeHost && hasExternalHost
      ? "pending"
      : "ready"
  const badgeClassName = getSkillRowStatusBadgeClassName(badgeTone)
  const packageLine = getGroupRowPackageLine(group) ?? getSkillKindLabel(group.kind, t)
  const runtimeLabel = hasAttention
    ? (status.description ?? t("skills.groupStatus.modifiedDescription", { count: 1 }))
    : !hasRuntimeHost && hasExternalHost
      ? t("skills.externalInstalledDescription", { platforms: getSkillPlatformLine(group, t) })
      : t("skills.installedDescription")

  return (
    <SkillListRow
      icon={<SkillIconFrame icon={group.icon} className="size-9" iconClassName="size-4.5" />}
      selected={selected}
      title={group.name}
      subtitle={
        <span className="min-w-0 truncate" title={packageLine}>
          {packageLine}
        </span>
      }
      description={group.description}
      badges={
        <Badge className={badgeClassName} variant={badgeTone === "danger" ? "destructive" : "outline"}>
          {statusLabel}
        </Badge>
      }
      meta={
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <InstalledSkillPlatformBadges group={group} />
          <span className="min-w-0 truncate" title={getSkillCreatorLine(group, t)}>
            {getSkillCreatorLine(group, t)}
          </span>
          <span className="min-w-0 truncate" title={runtimeLabel}>
            {runtimeLabel}
          </span>
        </div>
      }
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
          {t("skills.installedManage")}
        </Button>
      }
      onSelect={onOpen}
    />
  )
}

function InstalledSkillPlatformBadges({ group }: { group: ManagedSkillGroup }) {
  const hosts = getInstalledPlatformHosts(group)

  if (hosts.length === 0) {
    return null
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {hosts.map((host) => (
        <span
          key={`${host.agentId}:${host.path ?? host.agentName}`}
          className="inline-flex min-w-0 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5"
          title={host.path ? `${host.agentName}: ${host.path}` : host.agentName}
        >
          <AgentIcon host={host.agentName} className="oo-entity-icon-compact size-5 border-0" />
          <span className="oo-text-micro max-w-24 truncate text-muted-foreground">{host.agentName}</span>
        </span>
      ))}
    </div>
  )
}

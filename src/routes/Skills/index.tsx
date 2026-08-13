import type { SkillSelectionKey } from "./skill-route-model.ts"
import type { SkillDetailContentProps } from "./SkillDetailContent.tsx"

import * as React from "react"
import { InstalledSkillsPane } from "./InstalledSkillsPane.tsx"
import {
  getGroupStatus,
  getRuntimeHosts,
  getSelectedManagedSkillGroup,
  isInstalledSkillGroup,
  matchesInstalledSkillFilter,
} from "./skill-route-model.ts"
import { SkillDetailContent } from "./SkillDetailContent.tsx"
import { SkillPageHeader } from "./SkillPageHeader.tsx"
import { SkillManagementSheet } from "./SkillUiParts.tsx"
import { useSkillInventoryResource } from "@/components/AppDataHooks"
import { DeleteSkillConfirmDialog } from "@/components/DeleteSkillConfirmDialog"
import { useSkillObjectActions } from "@/components/useSkillObjectActions"
import { useAppI18n } from "@/i18n"
import type { InstalledSkillFilter } from "./skill-route-model.ts"

export function SkillsRoute() {
  const { t } = useAppI18n()
  const inventoryResource = useSkillInventoryResource()
  const inventory = inventoryResource.data
  const [selectedSkillId, setSelectedSkillId] = React.useState<SkillSelectionKey | null>(null)
  const [query, setQuery] = React.useState("")
  const [installedFilter, setInstalledFilter] = React.useState<InstalledSkillFilter>("all")
  const deferredInstalledQuery = React.useDeferredValue(query)
  const { copySkillPath, isRemovingSkill, openSkillFolder, removeSkill, removeTarget, setRemoveTarget } =
    useSkillObjectActions({
      onDeleted: () => {
        setSelectedSkillId(null)
      },
    })

  const searchedGroups = React.useMemo(() => {
    const groups = inventory?.groups ?? []
    const normalizedQuery = deferredInstalledQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return groups
    }

    return groups.filter((group) => {
      return (
        group.name.toLowerCase().includes(normalizedQuery) ||
        Boolean(group.description?.toLowerCase().includes(normalizedQuery)) ||
        Boolean(group.packageName?.toLowerCase().includes(normalizedQuery))
      )
    })
  }, [deferredInstalledQuery, inventory?.groups])

  const installedGroups = React.useMemo(() => searchedGroups.filter(isInstalledSkillGroup), [searchedGroups])
  const filteredInstalledGroups = React.useMemo(() => {
    return installedGroups.filter((group) => matchesInstalledSkillFilter(group, installedFilter))
  }, [installedFilter, installedGroups])
  const selectedSkill = getSelectedManagedSkillGroup(inventory?.groups ?? [], selectedSkillId)
  const selectedStatus = selectedSkill ? getGroupStatus(selectedSkill, t, getRuntimeHosts(selectedSkill)) : null

  const detailContentProps: SkillDetailContentProps = {
    copySkillPath,
    inventoryInitialLoading: inventoryResource.isInitialLoading,
    isRemovingSkill,
    openSkillFolder,
    requestRemoveSkill: (skill) => setRemoveTarget({ skill }),
    selectedSkill,
    selectedStatus,
  }
  return (
    <>
      <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <SkillPageHeader
          installedFilter={installedFilter}
          installedQuery={query}
          onInstalledFilterChange={setInstalledFilter}
          onInstalledQueryChange={setQuery}
        />
        <InstalledSkillsPane
          groups={filteredInstalledGroups}
          selectedSkill={
            selectedSkill && filteredInstalledGroups.some((group) => group.id === selectedSkill.id)
              ? selectedSkill
              : undefined
          }
          onSelectSkill={setSelectedSkillId}
        />
      </section>
      {selectedSkill ? (
        <SkillManagementSheet subjectName={selectedSkill.name} onClose={() => setSelectedSkillId(null)}>
          <SkillDetailContent {...detailContentProps} />
        </SkillManagementSheet>
      ) : null}
      <DeleteSkillConfirmDialog
        isRemoving={isRemovingSkill}
        target={removeTarget}
        onConfirm={removeSkill}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRemoveTarget(null)
          }
        }}
      />
    </>
  )
}

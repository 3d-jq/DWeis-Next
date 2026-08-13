import type { InstalledSkillFilter } from "./skill-route-model.ts"

import { isInstalledSkillFilter } from "./skill-route-model.ts"
import { AppIcons } from "@/components/AppIcons"
import { SearchField } from "@/components/SearchField"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAppI18n } from "@/i18n"

interface SkillPageHeaderProps {
  installedFilter: InstalledSkillFilter
  installedQuery: string
  onInstalledFilterChange: (filter: InstalledSkillFilter) => void
  onInstalledQueryChange: (value: string) => void
}

export function SkillPageHeader({
  installedFilter,
  installedQuery,
  onInstalledFilterChange,
  onInstalledQueryChange,
}: SkillPageHeaderProps) {
  const { t } = useAppI18n()
  const filterOptions = [
    { label: t("skills.installedFilter.all"), value: "all" },
    { label: t("skills.installedFilter.dweis"), value: "dweis" },
    { label: t("skills.installedFilter.codex"), value: "codex" },
    { label: t("skills.installedFilter.claudeCode"), value: "claude-code" },
    { label: t("skills.installedFilter.local"), value: "local" },
  ]

  return (
    <header className="oo-border-divider flex min-h-12 items-center border-b px-3 py-2">
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SearchField
            className="flex-1"
            placeholder={t("skills.installedSearch")}
            value={installedQuery}
            onChange={(event) => onInstalledQueryChange(event.currentTarget.value)}
          />
          <SkillFilterDropdown
            ariaLabel={t("skills.filter")}
            options={filterOptions}
            value={installedFilter}
            onValueChange={(value) => {
              if (isInstalledSkillFilter(value)) {
                onInstalledFilterChange(value)
              }
            }}
          />
        </div>
      </div>
    </header>
  )
}

interface SkillFilterDropdownProps {
  ariaLabel: string
  onValueChange: (value: string) => void
  options: { label: string; value: string }[]
  value: string
}

function SkillFilterDropdown({ ariaLabel, onValueChange, options, value }: SkillFilterDropdownProps) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-w-36 min-w-24 justify-between px-2"
          aria-label={ariaLabel}
        >
          <AppIcons.action.settings className="size-3.5" />
          <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
          <AppIcons.status.disclosure className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        {options.map((option) => {
          const selected = option.value === value

          return (
            <DropdownMenuItem
              key={option.value}
              className="min-w-0 justify-between gap-3"
              aria-checked={selected}
              onSelect={() => onValueChange(option.value)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {selected ? <AppIcons.status.check className="size-4" /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

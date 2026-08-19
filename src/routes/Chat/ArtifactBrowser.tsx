import type { LocalArtifactGroup, LocalArtifactItem, LocalArtifactPack } from "../../../electron/chat/common.ts"
import type { LocalArtifactPreviewCache } from "./artifact-preview-cache.ts"
import type { ResolvedArtifactGroup } from "./artifact-resolution.ts"
import type { ArtifactPreviewMode } from "./ArtifactPreviewPane.tsx"
import type { TranslateFn } from "@/i18n/i18n"

import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react"
import * as React from "react"
import { artifactKindLabel } from "./artifact-metadata.ts"
import { ImageGalleryPreview, ImageThumbnail } from "./ArtifactImageGallery.tsx"
import { FileKindTile } from "./file-type-icons.tsx"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

export interface ArtifactPanelEntry {
  key: string
  messageId: string
  group: LocalArtifactGroup
  item: LocalArtifactItem
  pack?: LocalArtifactPack
}

export interface ArtifactBrowseLevel {
  groups: ResolvedArtifactGroup[]
  label: string
  path: string
}

const artifactListMinHeightPx = 96

function shortArtifactPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : parts.join("/")
}

/** 按产物类型分组（目录优先），组内保持产物生成顺序；同名路径去重。 */
function groupPanelEntries(
  t: TranslateFn,
  entries: ArtifactPanelEntry[],
): { key: string; label: string; entries: ArtifactPanelEntry[] }[] {
  const seen = new Set<string>()
  const groups: { key: string; label: string; entries: ArtifactPanelEntry[] }[] = []
  for (const entry of entries) {
    if (seen.has(entry.item.path)) {
      continue
    }
    seen.add(entry.item.path)
    const key = entry.item.kind === "directory" ? "directory" : `kind:${artifactKindLabel(t, entry.item, entry.pack)}`
    let group = groups.find((candidate) => candidate.key === key)
    if (!group) {
      group = { key, label: artifactKindLabel(t, entry.item, entry.pack), entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups.sort((left, right) => (left.key === "directory" ? -1 : right.key === "directory" ? 1 : 0))
}

export function ArtifactFileList({
  baseCrumb,
  browseLevels,
  entries,
  listHeight,
  onContextMenu,
  onEnterFolder,
  onNavigateBreadcrumb,
  onResizeDoubleClick,
  onResizeKeyDown,
  onResizeStart,
  selectedItem,
  truncated,
  onOpenPath,
  onSelect,
}: {
  baseCrumb: { label: string; path: string }
  browseLevels: ArtifactBrowseLevel[]
  entries: ArtifactPanelEntry[]
  listHeight: number
  onContextMenu: (item: LocalArtifactItem, x: number, y: number) => void
  onEnterFolder: (entry: ArtifactPanelEntry) => void
  onNavigateBreadcrumb: (index: number) => void
  onResizeDoubleClick: () => void
  onResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  selectedItem: LocalArtifactItem | null
  truncated: boolean
  onOpenPath: (path: string | undefined) => void
  onSelect: (path: string) => void
}) {
  const t = useT()
  const [search, setSearch] = React.useState("")
  const keyword = search.trim().toLowerCase()
  const visibleEntries = React.useMemo(
    () => (keyword ? entries.filter((entry) => entry.item.name.toLowerCase().includes(keyword)) : entries),
    [entries, keyword],
  )
  const groups = React.useMemo(() => groupPanelEntries(t, visibleEntries), [t, visibleEntries])
  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.item.path === selectedItem?.path),
  )
  const visibleIndex = entries.length > 0 ? selectedIndex + 1 : 0

  return (
    <section className="flex shrink-0 flex-col" style={{ height: listHeight }}>
      <ArtifactBrowserHeader
        baseCrumb={baseCrumb}
        browseLevels={browseLevels}
        count={entries.length}
        index={visibleIndex}
        onNavigate={onNavigateBreadcrumb}
      />
      <div className="shrink-0 px-2.5 pb-1.5">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("artifacts.searchFiles")}
          aria-label={t("artifacts.searchFiles")}
          className="oo-text-caption-compact w-full rounded-md border border-border bg-background px-2 py-1 text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus:border-ring"
        />
      </div>
      <div className="oo-artifact-browser-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {visibleEntries.length === 0 ? (
          <p className="oo-text-caption px-1.5 py-4 text-center text-muted-foreground">{t("artifacts.searchEmpty")}</p>
        ) : (
          groups.map((group) => (
            <React.Fragment key={group.key}>
              <div className="oo-text-micro px-1.5 pt-2 pb-1 font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </div>
              {group.entries.map((entry) => (
                <ArtifactFileRow
                  key={entry.key}
                  entry={entry}
                  selected={entry.item.path === selectedItem?.path}
                  onClick={() => onSelect(entry.item.path)}
                  onContextMenu={(x, y) => onContextMenu(entry.item, x, y)}
                  onDoubleClick={() => {
                    if (entry.item.kind === "directory") {
                      onEnterFolder(entry)
                    } else {
                      onOpenPath(entry.item.path)
                    }
                  }}
                />
              ))}
            </React.Fragment>
          ))
        )}
        {truncated ? (
          <p className="oo-text-caption px-1.5 pt-2 text-muted-foreground">{t("artifacts.truncated")}</p>
        ) : null}
      </div>
      <ArtifactPanelResizeHandle
        value={listHeight}
        onDoubleClick={onResizeDoubleClick}
        onKeyDown={onResizeKeyDown}
        onPointerDown={onResizeStart}
      />
    </section>
  )
}

function ArtifactBrowserHeader({
  baseCrumb,
  browseLevels,
  count,
  index,
  onNavigate,
}: {
  baseCrumb: { label: string; path: string }
  browseLevels: ArtifactBrowseLevel[]
  count: number
  index: number
  onNavigate: (index: number) => void
}) {
  const t = useT()
  const crumbs = [baseCrumb, ...browseLevels.map((level) => ({ label: level.label, path: level.path }))]

  return (
    <div className="shrink-0 px-2.5 pt-1.5 pb-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          {browseLevels.length > 0 ? (
            <button
              type="button"
              title={t("artifacts.backToParent")}
              aria-label={t("artifacts.backToParent")}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => onNavigate(browseLevels.length - 2)}
            >
              <ChevronLeft className="size-4" />
            </button>
          ) : (
            <div
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground"
              aria-hidden
            >
              <FolderOpen className="size-4" />
            </div>
          )}
          <div className="oo-text-caption-compact flex min-w-0 items-center gap-1 font-medium text-muted-foreground">
            {crumbs.map((crumb, index) => {
              const active = index === crumbs.length - 1
              const navigateIndex = index - 1
              return (
                <React.Fragment key={`${crumb.path}:${index}`}>
                  {index > 0 ? <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" /> : null}
                  <button
                    type="button"
                    disabled={active}
                    title={crumb.path}
                    className={cn(
                      "min-w-0 truncate rounded px-1 py-0.5 text-left disabled:cursor-default",
                      active ? "text-foreground" : "hover:bg-accent hover:text-foreground",
                    )}
                    onClick={() => onNavigate(navigateIndex)}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </div>
        <div className="oo-text-caption text-muted-foreground">
          {index}/{count}
        </div>
      </div>
    </div>
  )
}

function ArtifactPanelResizeHandle({
  onDoubleClick,
  onKeyDown,
  onPointerDown,
  value,
}: {
  onDoubleClick: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  value: number
}) {
  const t = useT()

  return (
    <div
      role="separator"
      aria-label={t("artifacts.resizeFileBrowser")}
      aria-orientation="horizontal"
      aria-valuemin={artifactListMinHeightPx}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={t("artifacts.resizeFileBrowser")}
      className="group -mb-1 flex h-3 shrink-0 cursor-row-resize items-center outline-none"
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      <div className="h-px w-full bg-border transition-colors group-hover:bg-ring group-focus-visible:bg-ring" />
    </div>
  )
}

function ArtifactFileRow({
  entry,
  selected,
  onClick,
  onContextMenu,
  onDoubleClick,
}: {
  entry: ArtifactPanelEntry
  selected: boolean
  onClick: () => void
  onContextMenu: (x: number, y: number) => void
  onDoubleClick: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      title={entry.item.path}
      className={cn(
        "oo-artifact-selectable flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors focus-visible:outline-none",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
      onClick={onClick}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onContextMenu(event.clientX, event.clientY)
      }}
      onDoubleClick={onDoubleClick}
    >
      <FileKindTile source={entry.item} pack={entry.pack} className="size-6" iconClassName="size-3.5" />
      <span className="min-w-0 flex-1">
        <span className="oo-text-caption-compact block truncate font-medium text-foreground">{entry.item.name}</span>
        <span className="oo-text-micro block truncate text-muted-foreground">{shortArtifactPath(entry.item.path)}</span>
      </span>
      <span className="oo-text-micro shrink-0 text-muted-foreground uppercase">
        {artifactKindLabel(t, entry.item, entry.pack)}
      </span>
    </button>
  )
}

export function ImageGalleryPanel({
  baseCrumb,
  browseLevels,
  entries,
  group,
  listHeight,
  mode,
  onContextMenu,
  onEnterFolder,
  onModeChange,
  onNavigateBreadcrumb,
  previewCache,
  selectedItem,
  onOpenPath,
  onResizeDoubleClick,
  onResizeKeyDown,
  onResizeStart,
  onSelect,
}: {
  baseCrumb: { label: string; path: string }
  browseLevels: ArtifactBrowseLevel[]
  entries: ArtifactPanelEntry[]
  group: LocalArtifactGroup | null
  listHeight: number
  mode: ArtifactPreviewMode
  onContextMenu: (item: LocalArtifactItem, x: number, y: number) => void
  onEnterFolder: (entry: ArtifactPanelEntry) => void
  onModeChange: (mode: ArtifactPreviewMode) => void
  onNavigateBreadcrumb: (index: number) => void
  previewCache: LocalArtifactPreviewCache
  selectedItem: LocalArtifactItem | null
  onOpenPath: (path: string | undefined) => void
  onResizeDoubleClick: () => void
  onResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  onSelect: (path: string) => void
}) {
  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.item.path === selectedItem?.path),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="flex shrink-0 flex-col" style={{ height: listHeight }}>
        <ArtifactBrowserHeader
          baseCrumb={baseCrumb}
          browseLevels={browseLevels}
          count={entries.length}
          index={selectedIndex + 1}
          onNavigate={onNavigateBreadcrumb}
        />
        <div className="oo-artifact-browser-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-1.5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-1.5">
            {entries.map((entry, index) => (
              <ImageThumbnail
                key={entry.key}
                index={index + 1}
                item={entry.item}
                selected={entry.item.path === selectedItem?.path}
                onClick={() => onSelect(entry.item.path)}
                onContextMenu={(x, y) => onContextMenu(entry.item, x, y)}
                onDoubleClick={() => {
                  if (entry.item.kind === "directory") {
                    onEnterFolder(entry)
                  } else {
                    onOpenPath(entry.item.path)
                  }
                }}
              />
            ))}
          </div>
        </div>
        <ArtifactPanelResizeHandle
          value={listHeight}
          onDoubleClick={onResizeDoubleClick}
          onKeyDown={onResizeKeyDown}
          onPointerDown={onResizeStart}
        />
      </section>
      <ImageGalleryPreview
        group={group}
        item={selectedItem}
        mode={mode}
        onModeChange={onModeChange}
        previewCache={previewCache}
        onContextMenu={onContextMenu}
        onOpen={() => onOpenPath(selectedItem?.path)}
      />
    </div>
  )
}

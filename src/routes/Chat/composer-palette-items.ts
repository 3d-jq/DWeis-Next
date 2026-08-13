import type { ChatContextMention } from "../../../electron/chat/common.ts"
import type { LocalArtifactItem, LocalArtifactPack } from "../../../electron/chat/common.ts"
import type { KnowledgeBaseSummary } from "../../../electron/knowledge/common.ts"
import type { ManagedSkillGroup } from "../../../electron/skills/common.ts"
import type { ComposerPaletteItem } from "./ComposerPalette.tsx"
import type { TranslateFn } from "@/i18n/i18n"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"

import { Bug, File, FileImage, Folder, LibraryBig, Minimize2, Package, Redo2, Search, SlidersHorizontal, Sparkles, Undo2 } from "lucide-react"
import * as React from "react"
import { KNOWLEDGE_LIBRARY_CONTEXT_ID } from "../../../electron/knowledge/common.ts"
import { normalizeSkillIconSource } from "@/components/skill-icon-source"
import { SkillIcon } from "@/components/SkillIcon"
import { artifactGroupDisplayItem } from "@/routes/Chat/artifact-metadata"
import { isEmojiIcon, isImageIcon } from "@/routes/Skills/skill-route-model"

export const creatorSkillId = "skill-creator"
export const browserSkillId = "browser"
const browserSkillIcon = ":lucide:search:"
const builtInSkillIds = new Set([browserSkillId, creatorSkillId, "oo", "oo-find-skills", "oo-publish-skill"])
const knowledgeContextPreviewLimit = 4

export type SlashCommandAction =
  | "attach-file-or-folder"
  | "attach-file"
  | "attach-folder"
  | "billing"
  | "bug-report"
  | "compact"
  | "custom"
  | "init"
  | "redo"
  | "review"
  | "skills"
  | "undo"

export interface SlashCommandPaletteItem extends ComposerPaletteItem {
  action: SlashCommandAction
  kind: "slash"
  /** 自定义命令（.opencode/command/*.md）的模板正文；action 为 "custom" 时使用。 */
  template?: string
}

export interface SkillPaletteItem extends ComposerPaletteItem {
  descriptionText: string
  iconSource?: string
  kind: "skill"
  skillId: string
  skillName: string
}

export type AttachmentPaletteItem = ComposerPaletteItem & {
  action: AttachmentPaletteAction
  kind: "attachment"
}

export type AttachmentPaletteAction = "attach-file" | "attach-folder" | "attach-file-or-folder"

export interface ArtifactPaletteItem extends ComposerPaletteItem {
  artifact: LocalArtifactItem
  kind: "artifact"
}

export interface KnowledgePaletteItem extends ComposerPaletteItem {
  kind: "knowledge"
  knowledgeBase: KnowledgeBaseSummary
  scope: "archive" | "library"
  selected: boolean
}

export interface KnowledgeLibraryPaletteItem extends ComposerPaletteItem {
  kind: "knowledge-library"
}

export type ChatComposerPaletteItem =
  | ArtifactPaletteItem
  | AttachmentPaletteItem
  | KnowledgeLibraryPaletteItem
  | KnowledgePaletteItem
  | SkillPaletteItem
  | SlashCommandPaletteItem

export interface BrowserSkillPaletteCopy {
  description: string
  title: string
}

export function skillPaletteContextMention(item: SkillPaletteItem): Extract<ChatContextMention, { kind: "skill" }> {
  return {
    description: item.descriptionText,
    displayName: item.title,
    icon: item.iconSource,
    id: item.skillId,
    kind: "skill",
    name: item.skillName,
  }
}

export interface KnowledgePaletteCopy {
  emptyDescription: string
  emptyTitle: string
  failedDescription: string
  failedTitle: string
  libraryDescription: string
  libraryTitle: string
  loadingDescription: string
  loadingTitle: string
  selected: string
}

function supportsCombinedAttachmentPicker(platform: NodeJS.Platform | undefined): boolean {
  return platform === "darwin"
}

function normalizedSearchText(value: string): string {
  return value.trim().toLowerCase()
}

function normalizedSearchCandidates(item: ComposerPaletteItem): Array<{ priority: number; value: string }> {
  return [
    { priority: 0, value: item.id },
    { priority: 0, value: item.title },
    ...(item.keywords ?? []).map((value) => ({ priority: 1, value })),
    { priority: 2, value: item.meta ?? "" },
    { priority: 3, value: item.description },
  ].map((candidate) => ({ ...candidate, value: normalizedSearchText(candidate.value) }))
}

export function composerQueryScore(item: ComposerPaletteItem, query: string): number {
  const normalized = normalizedSearchText(query)
  if (!normalized) {
    return 0
  }

  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of normalizedSearchCandidates(item)) {
    if (!candidate.value) {
      continue
    }
    const titleOrIdBoost = candidate.priority === 0 ? 0 : 10 + candidate.priority * 10
    let score = Number.POSITIVE_INFINITY
    if (candidate.value === normalized) {
      score = titleOrIdBoost
    } else if (candidate.value.startsWith(normalized)) {
      score = titleOrIdBoost + 1
    } else if (candidate.value.split(/[\s:_./-]+/).some((part) => part.startsWith(normalized))) {
      score = titleOrIdBoost + 2
    } else {
      const index = candidate.value.indexOf(normalized)
      if (index >= 0) {
        score = titleOrIdBoost + 3 + Math.min(index, 20) / 100
      }
    }
    bestScore = Math.min(bestScore, score)
  }

  return bestScore
}

export function filterComposerPaletteItems<TItem extends ComposerPaletteItem>(
  items: TItem[],
  query: string,
  limit = 8,
): TItem[] {
  return items
    .map((item, index) => ({ index, item, score: composerQueryScore(item, query) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.item)
}

function installedSkillHostCount(group: ManagedSkillGroup): number {
  return group.runtimeHosts.filter((host) => host.status === "installed").length
}





function skillKindMeta(group: ManagedSkillGroup): string {
  if (builtInSkillIds.has(group.id)) {
    return "built-in"
  }
  if (group.kind === "registry") {
    return "registry"
  }
  if (group.kind === "local") {
    return "local"
  }
  return ""
}

function skillPaletteIcon(icon: string | undefined): React.ReactNode {
  const normalizedIcon = normalizeSkillIconSource(icon)

  if (isImageIcon(normalizedIcon)) {
    return React.createElement("img", {
      alt: "",
      className: "size-5 rounded-sm object-contain",
      src: normalizedIcon,
    })
  }

  if (isEmojiIcon(normalizedIcon)) {
    return React.createElement("span", { className: "text-base leading-none" }, normalizedIcon)
  }

  return React.createElement(SkillIcon, { className: "size-4", icon: normalizedIcon })
}

function buildBrowserSkillPaletteItem(copy: BrowserSkillPaletteCopy): SkillPaletteItem {
  return {
    description: copy.description,
    descriptionText: copy.description,
    icon: skillPaletteIcon(browserSkillIcon),
    iconSource: browserSkillIcon,
    id: `skill:${browserSkillId}`,
    kind: "skill",
    meta: "built-in",
    skillId: browserSkillId,
    skillName: browserSkillId,
    title: copy.title,
  }
}

export function buildSkillPaletteItems(
  groups: ManagedSkillGroup[],
  fallbackDescription: string,
  browserSkillCopy: BrowserSkillPaletteCopy | null,
): SkillPaletteItem[] {
  // skill-creator（创建技能）不再硬编码，作为库存里的普通技能自然出现在列表中。
  const browserSkillItems = browserSkillCopy ? [buildBrowserSkillPaletteItem(browserSkillCopy)] : []
  const inventoryItems = groups
    .filter((group) => installedSkillHostCount(group) > 0)
    .filter((group) => group.id !== browserSkillId)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (group): SkillPaletteItem => ({
        description: group.description || fallbackDescription,
        descriptionText: group.description || fallbackDescription,
        icon: skillPaletteIcon(group.icon),
        ...(group.icon ? { iconSource: group.icon } : {}),
        id: `skill:${group.id}`,
        kind: "skill",
        meta: skillKindMeta(group),
        skillId: group.id,
        skillName: group.name || group.id,
        title: group.name || group.id,
      }),
    )

  return [...browserSkillItems, ...inventoryItems]
}

function knowledgeDescription(item: KnowledgeBaseSummary): string {
  return [item.relativePath, ...item.authors, item.publisher].filter(Boolean).join(" · ")
}

function knowledgeIcon(item: KnowledgeBaseSummary): React.ReactNode {
  if (item.coverDataUrl) {
    return React.createElement("img", {
      alt: "",
      className: "size-6 rounded-sm object-cover",
      src: item.coverDataUrl,
    })
  }
  return React.createElement(LibraryBig, { className: "size-4" })
}

function knowledgeLibrarySummary(copy: KnowledgePaletteCopy): KnowledgeBaseSummary {
  return {
    authors: [],
    capabilities: {
      fullTextSearch: true,
      knowledgeGraph: true,
      readingGraph: true,
      summary: true,
    },
    id: KNOWLEDGE_LIBRARY_CONTEXT_ID,
    importedAt: Number.MAX_SAFE_INTEGER,
    relativePath: KNOWLEDGE_LIBRARY_CONTEXT_ID,
    size: 0,
    sourceFileName: "",
    statistics: {},
    title: copy.libraryTitle,
  }
}

export function buildKnowledgePaletteItems(
  items: KnowledgeBaseSummary[],
  selectedIds: readonly string[],
  copy: KnowledgePaletteCopy,
  state: { error: boolean; loading: boolean },
): Array<KnowledgeLibraryPaletteItem | KnowledgePaletteItem> {
  const selected = new Set(selectedIds)
  if (state.loading || state.error) {
    const unavailable = state.loading
      ? { description: copy.loadingDescription, disabled: true, title: copy.loadingTitle }
      : { description: copy.failedDescription, title: copy.failedTitle }
    return [
      {
        ...unavailable,
        icon: React.createElement(LibraryBig, { className: "size-4" }),
        id: "knowledge-library",
        keywords: ["knowledge", "library", "book", "知识库", "书"],
        kind: "knowledge-library",
        meta: "knowledge",
      },
    ]
  }

  const librarySelected = selected.has(KNOWLEDGE_LIBRARY_CONTEXT_ID)
  const libraryItem: KnowledgePaletteItem = {
    description: items.length > 0 ? copy.libraryDescription : copy.emptyDescription,
    icon: React.createElement(LibraryBig, { className: "size-4" }),
    id: `knowledge:${KNOWLEDGE_LIBRARY_CONTEXT_ID}`,
    keywords: ["knowledge", "library", "book", "all", "global", "知识库", "全局", "全部", "书"],
    kind: "knowledge",
    knowledgeBase: knowledgeLibrarySummary(copy),
    meta: librarySelected ? copy.selected : "knowledge",
    scope: "library",
    selected: librarySelected,
    title: copy.libraryTitle,
  }

  const archiveItems = items
    .slice()
    .sort((left, right) => {
      const leftSelected = selected.has(left.id)
      const rightSelected = selected.has(right.id)
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1
      return right.importedAt - left.importedAt || left.title.localeCompare(right.title)
    })
    .map((item): KnowledgePaletteItem => {
      const isSelected = selected.has(item.id)
      return {
        description: knowledgeDescription(item),
        icon: knowledgeIcon(item),
        id: `knowledge:${item.id}`,
        keywords: [
          item.title,
          ...item.authors,
          item.publisher,
          item.publishedAt,
          item.sourceFileName,
          item.relativePath,
        ].filter((value): value is string => Boolean(value)),
        kind: "knowledge",
        knowledgeBase: item,
        meta: isSelected ? copy.selected : "knowledge",
        scope: "archive",
        selected: isSelected,
        title: item.title,
      }
    })

  return [libraryItem, ...archiveItems]
}

export function buildContextPaletteItems({
  artifactItems = [],
  knowledgeItems = [],
  platform,
  t,
}: {
  artifactItems?: ArtifactPaletteItem[]
  knowledgeItems?: Array<KnowledgeLibraryPaletteItem | KnowledgePaletteItem>
  platform?: NodeJS.Platform
  t: TranslateFn
}): Array<
  | ArtifactPaletteItem
  | AttachmentPaletteItem
  | KnowledgeLibraryPaletteItem
  | KnowledgePaletteItem
> {
  const attachmentItems: AttachmentPaletteItem[] = supportsCombinedAttachmentPicker(platform)
    ? [
        {
          action: "attach-file-or-folder",
          description: t("chat.contextAttachFileOrFolderDescription"),
          icon: React.createElement(File, { className: "size-4" }),
          id: "context:attach-file-or-folder",
          kind: "attachment",
          meta: "file/folder",
          title: t("chat.attachFileOrFolderAction"),
        },
      ]
    : [
        {
          action: "attach-file",
          description: t("chat.contextAttachFileDescription"),
          icon: React.createElement(File, { className: "size-4" }),
          id: "context:attach-file",
          kind: "attachment",
          meta: "file",
          title: t("chat.attachFileAction"),
        },
        {
          action: "attach-folder",
          description: t("chat.contextAttachFolderDescription"),
          icon: React.createElement(Folder, { className: "size-4" }),
          id: "context:attach-folder",
          kind: "attachment",
          meta: "folder",
          title: t("chat.attachFolderAction"),
        },
      ]
  return [
    ...knowledgeItems.slice(0, knowledgeContextPreviewLimit),
    ...attachmentItems,
    ...artifactItems,
    ...knowledgeItems.slice(knowledgeContextPreviewLimit),
  ]
}

function packDisplayItems(pack: LocalArtifactPack): LocalArtifactItem[] {
  if (pack.display === "gallery") {
    return pack.items
  }
  const supporting = pack.supporting.filter((item) => item.role !== "metadata")
  return pack.items.length > 0 ? [...pack.items, ...supporting] : supporting
}

function artifactSelectionItems(selection: ArtifactSelection | null): LocalArtifactItem[] {
  if (!selection) {
    return []
  }
  const groups =
    selection.groups && selection.groups.length > 0
      ? selection.groups
      : [
          {
            group: selection.group,
            messageId: selection.messageId,
            ...(selection.pack ? { pack: selection.pack } : {}),
          },
        ]
  const items = groups.flatMap(({ group, pack }) => {
    const displayItem = artifactGroupDisplayItem(group, pack)
    const groupItems = pack ? packDisplayItems(pack) : group.items
    if (!displayItem || displayItem.kind !== "directory") {
      return groupItems
    }
    return [displayItem, ...groupItems]
  })
  const byPath = new Map<string, LocalArtifactItem>()
  for (const item of items) {
    if (!byPath.has(item.path)) {
      byPath.set(item.path, item)
    }
  }
  const uniqueItems = Array.from(byPath.values())
  const selectedPath = selection.selectedPath
  return uniqueItems.sort((left, right) => {
    if (selectedPath) {
      if (left.path === selectedPath) {
        return -1
      }
      if (right.path === selectedPath) {
        return 1
      }
    }
    const leftImage = left.mime.toLowerCase().startsWith("image/")
    const rightImage = right.mime.toLowerCase().startsWith("image/")
    if (leftImage !== rightImage) {
      return leftImage ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

function artifactKindMeta(item: LocalArtifactItem): string {
  if (item.kind === "directory") {
    return "folder"
  }
  const [type] = item.mime.split("/")
  return type || "file"
}

export function buildArtifactPaletteItems(selection: ArtifactSelection | null, t: TranslateFn): ArtifactPaletteItem[] {
  return artifactSelectionItems(selection).map((item) => {
    const isImage = item.mime.toLowerCase().startsWith("image/")
    const Icon = item.kind === "directory" ? Folder : isImage ? FileImage : File
    return {
      artifact: item,
      description: t(isImage ? "chat.contextGeneratedImageDescription" : "chat.contextGeneratedArtifactDescription"),
      icon: React.createElement(Icon, { className: "size-4" }),
      id: `artifact:${item.path}`,
      kind: "artifact",
      meta: artifactKindMeta(item),
      title: item.name,
    }
  })
}

export function slashCommandItems({
  canViewBilling,
  hasMessages,
  platform,
  t,
}: {
  canViewBilling: boolean
  hasMessages: boolean
  platform?: NodeJS.Platform
  t: TranslateFn
}): SlashCommandPaletteItem[] {
  const attachmentItems: SlashCommandPaletteItem[] = supportsCombinedAttachmentPicker(platform)
    ? [
        {
          action: "attach-file-or-folder",
          description: t("chat.commandAttachFileOrFolderDescription"),
          icon: React.createElement(File, { className: "size-4" }),
          id: "attach-file-or-folder",
          kind: "slash",
          meta: "file/folder",
          title: t("chat.commandAttachFileOrFolder"),
        },
      ]
    : [
        {
          action: "attach-file",
          description: t("chat.commandAttachFileDescription"),
          icon: React.createElement(File, { className: "size-4" }),
          id: "attach-file",
          kind: "slash",
          meta: "file",
          title: t("chat.commandAttachFile"),
        },
        {
          action: "attach-folder",
          description: t("chat.commandAttachFolderDescription"),
          icon: React.createElement(Folder, { className: "size-4" }),
          id: "attach-folder",
          kind: "slash",
          meta: "folder",
          title: t("chat.commandAttachFolder"),
        },
      ]
  return [
    {
      action: "skills",
      description: t("chat.commandSkillsDescription"),
      icon: React.createElement(Package, { className: "size-4" }),
      id: "skills",
      kind: "slash",
      meta: "context",
      title: t("chat.commandSkills"),
    },
    {
      action: "init",
      description: t("chat.commandInitDescription"),
      icon: React.createElement(Sparkles, { className: "size-4" }),
      id: "init",
      keywords: ["agents", "project", "rules", "instructions", "项目", "说明", "规则"],
      kind: "slash",
      meta: "command",
      title: t("chat.commandInit"),
    },
    {
      action: "review",
      description: t("chat.commandReviewDescription"),
      icon: React.createElement(Search, { className: "size-4" }),
      id: "review",
      keywords: ["review", "code", "changes", "审查", "代码", "检查", "变更"],
      kind: "slash",
      meta: "command",
      title: t("chat.commandReview"),
    },
    {
      action: "compact",
      description: t("chat.commandCompactDescription"),
      disabled: !hasMessages,
      icon: React.createElement(Minimize2, { className: "size-4" }),
      id: "compact",
      keywords: ["summarize", "context", "history", "压缩", "总结", "上下文"],
      kind: "slash",
      meta: "session",
      title: t("chat.commandCompact"),
    },
    {
      action: "undo",
      description: t("chat.commandUndoDescription"),
      disabled: !hasMessages,
      icon: React.createElement(Undo2, { className: "size-4" }),
      id: "undo",
      keywords: ["revert", "rollback", "撤销", "回滚"],
      kind: "slash",
      meta: "session",
      title: t("chat.commandUndo"),
    },
    {
      action: "redo",
      description: t("chat.commandRedoDescription"),
      disabled: !hasMessages,
      icon: React.createElement(Redo2, { className: "size-4" }),
      id: "redo",
      keywords: ["restore", "recover", "重做", "恢复"],
      kind: "slash",
      meta: "session",
      title: t("chat.commandRedo"),
    },
    {
      action: "bug-report",
      description: t("chat.commandBugReportDescription"),
      icon: React.createElement(Bug, { className: "size-4" }),
      id: "bug-report",
      keywords: ["bug", "report", "issue", "feedback", "问题", "报告", "反馈"],
      kind: "slash",
      meta: "command",
      title: t("chat.commandBugReport"),
    },
    ...attachmentItems,
    ...(canViewBilling
      ? [
          {
            action: "billing" as const,
            description: t("chat.commandBillingDescription"),
            icon: React.createElement(SlidersHorizontal, { className: "size-4" }),
            id: "billing",
            kind: "slash" as const,
            meta: "ui" as const,
            title: t("chat.commandBilling"),
          },
        ]
      : []),
  ]
}

export function buildSlashRootPaletteItems({
  skillItems: _skillItems,
  slashItems,
}: {
  skillItems: SkillPaletteItem[]
  slashItems: SlashCommandPaletteItem[]
}): ChatComposerPaletteItem[] {
  // / 根菜单只显示斜杠命令；全部技能（含 skill-creator）统一在 /skills 技能列表里列出。
  return slashItems
}

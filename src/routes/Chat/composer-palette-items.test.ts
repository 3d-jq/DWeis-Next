import type { KnowledgeBaseSummary } from "../../../electron/knowledge/common.ts"
import type { ManagedSkillGroup } from "../../../electron/skills/common.ts"
import type { TranslateFn } from "@/i18n/i18n"

import * as React from "react"
import { describe, expect, it } from "vitest"
import {
  buildArtifactPaletteItems,
  buildContextPaletteItems,
  buildKnowledgePaletteItems,
  buildSlashRootPaletteItems,
  buildSkillPaletteItems,
  browserSkillId,
  filterComposerPaletteItems,
  skillPaletteContextMention,
  creatorSkillId,
  slashCommandItems,
} from "./composer-palette-items.ts"

const translations: Record<string, string> = {
  "chat.attachFileAction": "Add file",
  "chat.attachFileOrFolderAction": "Add file or folder",
  "chat.attachFolderAction": "Add folder",
  "chat.commandAttachFile": "Attach file",
  "chat.commandAttachFileDescription": "Add a file from disk as context",
  "chat.commandAttachFileOrFolder": "Attach file or folder",
  "chat.commandAttachFileOrFolderDescription": "Add a file or folder from disk as context",
  "chat.commandAttachFolder": "Attach folder",
  "chat.commandAttachFolderDescription": "Add a folder from disk as context",
  "chat.commandBilling": "Billing",
  "chat.commandBillingDescription": "View credits and subscription",
  "chat.commandBugReport": "Bug report",
  "chat.commandBugReportDescription": "Generate a Markdown report for DWeis developers from this task",
  "chat.commandBrowserSkill": "Browser",
  "chat.commandBrowserSkillDescription": "Use the visible integrated browser for this request",
  "chat.commandCreatorSkill": "Creator Skill",
  "chat.commandCreatorSkillDescription": "Create or adopt a reusable skill with ooCLI",
  "chat.commandSkills": "Skills",
  "chat.commandSkillsDescription": "Choose skill context for this turn",
  "chat.contextAttachFileDescription": "Choose a file from disk for this turn",
  "chat.contextAttachFileOrFolderDescription": "Choose a file or folder from disk for this turn",
  "chat.contextAttachFolderDescription": "Choose a folder from disk for this turn",
  "chat.contextGeneratedArtifactDescription": "Reference a generated file from this chat",
  "chat.contextGeneratedImageDescription": "Reference a generated image from this chat",
  "chat.knowledgePaletteEmptyDescription": "Open the library and import a book",
  "chat.knowledgePaletteEmptyTitle": "Import knowledge base",
  "chat.knowledgePaletteFailedDescription": "Open knowledge management and try again",
  "chat.knowledgePaletteFailedTitle": "Knowledge bases are unavailable",
  "chat.knowledgePaletteLibraryDescription": "Search across every imported WikiGraph knowledge base",
  "chat.knowledgePaletteLibraryTitle": "Knowledge library",
  "chat.knowledgePaletteLoadingDescription": "Reading imported books",
  "chat.knowledgePaletteLoadingTitle": "Loading knowledge bases",
  "chat.knowledgePaletteSelected": "Referenced",
}

const t = ((key: string) => translations[key] ?? key) as TranslateFn
const browserSkillCopy = {
  description: translations["chat.commandBrowserSkillDescription"] ?? "",
  title: translations["chat.commandBrowserSkill"] ?? "",
}
const knowledgePaletteCopy = {
  emptyDescription: translations["chat.knowledgePaletteEmptyDescription"] ?? "",
  emptyTitle: translations["chat.knowledgePaletteEmptyTitle"] ?? "",
  failedDescription: translations["chat.knowledgePaletteFailedDescription"] ?? "",
  failedTitle: translations["chat.knowledgePaletteFailedTitle"] ?? "",
  libraryDescription: translations["chat.knowledgePaletteLibraryDescription"] ?? "",
  libraryTitle: translations["chat.knowledgePaletteLibraryTitle"] ?? "",
  loadingDescription: translations["chat.knowledgePaletteLoadingDescription"] ?? "",
  loadingTitle: translations["chat.knowledgePaletteLoadingTitle"] ?? "",
  selected: translations["chat.knowledgePaletteSelected"] ?? "",
}

function knowledgeBase(
  id: string,
  title: string,
  importedAt: number,
  authors: string[] = [],
  publisher?: string,
): KnowledgeBaseSummary {
  return {
    authors,
    capabilities: {
      fullTextSearch: true,
      knowledgeGraph: true,
      readingGraph: false,
      summary: true,
    },
    id,
    importedAt,
    ...(publisher ? { publisher } : {}),
    relativePath: `${id}.wikg`,
    size: 1024,
    sourceFileName: `${id}.wikg`,
    statistics: {},
    title,
  }
}

function runtimeSkillGroup(
  id: string,
  kind: ManagedSkillGroup["kind"] = "local",
  icon?: string,
  packageName?: string,
): ManagedSkillGroup {
  return {
    externalHosts: [],
    hosts: [
      {
        agentId: "dweis",
        agentName: "DWeis",
        scope: "runtime",
        status: "installed",
        kind,
      },
    ],
    id,
    ...(icon ? { icon } : {}),
    kind,
    name: id,
    ...(packageName ? { packageName } : {}),
    runtimeHosts: [
      {
        agentId: "dweis",
        agentName: "DWeis",
        scope: "runtime",
        status: "installed",
        kind,
      },
    ],
  }
}

describe("composer palette items", () => {
  it("lists slash commands without prompt inserts", () => {
    const items = slashCommandItems({ canViewBilling: true, hasMessages: true, t })

    expect(items.map((item) => item.id)).toEqual([
      "skills",
      "init",
      "review",
      "compact",
      "undo",
      "redo",
      "bug-report",
      "attach-file",
      "attach-folder",
      "billing",
    ])
    expect(items.some((item) => ["summarize", "status"].includes(item.id))).toBe(false)
  })

  it("merges file and folder slash commands on macOS", () => {
    const items = slashCommandItems({ canViewBilling: true, hasMessages: true, platform: "darwin", t })

    expect(items.map((item) => item.id)).toEqual([
      "skills",
      "init",
      "review",
      "compact",
      "undo",
      "redo",
      "bug-report",
      "attach-file-or-folder",
      "billing",
    ])
  })

  it("hides the billing slash command when billing is unavailable", () => {
    const items = slashCommandItems({ canViewBilling: false, hasMessages: true, t })

    expect(items.map((item) => item.id)).toEqual([
      "skills",
      "init",
      "review",
      "compact",
      "undo",
      "redo",
      "bug-report",
      "attach-file",
      "attach-folder",
    ])
  })

  it("disables the compact command when the session has no messages", () => {
    const empty = slashCommandItems({ canViewBilling: true, hasMessages: false, t })
    expect(empty.find((item) => item.id === "compact")?.disabled).toBe(true)

    const withHistory = slashCommandItems({ canViewBilling: true, hasMessages: true, t })
    expect(withHistory.find((item) => item.id === "compact")?.disabled).toBe(false)
  })

  it("pins the browser skill first and lists inventory skills (including skill-creator) naturally", () => {
    const items = buildSkillPaletteItems(
      [
        runtimeSkillGroup("zeta"),
        runtimeSkillGroup(browserSkillId),
        runtimeSkillGroup(creatorSkillId),
        runtimeSkillGroup("team-skill"),
      ],
      "Fallback",
      browserSkillCopy,
    )

    expect(items.map((item) => item.skillId)).toEqual([browserSkillId, creatorSkillId, "team-skill", "zeta"])
    expect(items[0]).toMatchObject({
      description: "Use the visible integrated browser for this request",
      iconSource: ":lucide:search:",
      meta: "built-in",
      title: "Browser",
    })
    expect(skillPaletteContextMention(items[0]!)).toMatchObject({
      displayName: "Browser",
      id: "browser",
      kind: "skill",
      name: "browser",
    })
    expect(items[1]?.skillId).toBe(creatorSkillId)
    expect(items[1]?.title).toBe(creatorSkillId)
    expect(items[1]?.meta).not.toBe("team")
  })

  it("hides the explicit browser skill when Browser is disabled", () => {
    const items = buildSkillPaletteItems(
      [runtimeSkillGroup(browserSkillId), runtimeSkillGroup("zeta")],
      "Fallback",
      null,
    )

    expect(items.map((item) => item.skillId)).toEqual(["zeta"])
  })


  it("marks built-in oo skills consistently in the skill palette", () => {
    const items = buildSkillPaletteItems(
      [
        runtimeSkillGroup("oo", "registry"),
        runtimeSkillGroup("oo-find-skills", "registry"),
        runtimeSkillGroup("oo-publish-skill", "registry"),
        runtimeSkillGroup("packaging-copy-proofreader", "local"),
      ],
      "Fallback",
      browserSkillCopy,
    )
    const metaBySkillId = new Map(items.map((item) => [item.skillId, item.meta]))

    expect(metaBySkillId.get(browserSkillId)).toBe("built-in")
    expect(metaBySkillId.get("oo")).toBe("built-in")
    expect(metaBySkillId.get("oo-find-skills")).toBe("built-in")
    expect(metaBySkillId.get("oo-publish-skill")).toBe("built-in")
    expect(metaBySkillId.get("packaging-copy-proofreader")).toBe("local")
  })

  it("uses inventory skill icons in the skill palette", () => {
    const items = buildSkillPaletteItems(
      [runtimeSkillGroup("ecommerce-image-studio", "registry", ":lucide:shopping-bag:")],
      "Fallback",
      browserSkillCopy,
    )
    const item = items.find((candidate) => candidate.skillId === "ecommerce-image-studio")
    const icon = item?.icon

    expect(React.isValidElement<{ icon?: string }>(icon)).toBe(true)
    expect(item?.iconSource).toBe(":lucide:shopping-bag:")
    expect(React.isValidElement<{ icon?: string }>(icon) ? icon.props.icon : undefined).toBe(":lucide:shopping-bag:")
  })

  it("lists all skills under the /skills palette and keeps slash root to commands only", () => {
    const slashItems = slashCommandItems({ canViewBilling: true, hasMessages: true, t })
    const skillItems = buildSkillPaletteItems(
      [
        runtimeSkillGroup(creatorSkillId),
        runtimeSkillGroup("gpt-image-2", "registry", ":simple-icons:openai:"),
        runtimeSkillGroup("ai-elements", "local"),
      ],
      "Fallback",
      browserSkillCopy,
    )
    const rootItems = buildSlashRootPaletteItems({ skillItems, slashItems })

    // / 根菜单只显示通用斜杠命令（不含创建技能——它已收进技能列表），技能不单独铺开
    expect(rootItems.some((item) => item.kind === "skill")).toBe(false)
    expect(rootItems.some((item) => item.kind === "slash" && item.action === "skills")).toBe(true)
    // 全部技能（含 skill-creator）统一在 /skills 技能列表里
    expect(skillItems.some((item) => item.kind === "skill" && item.skillId === "gpt-image-2")).toBe(true)
    expect(skillItems.some((item) => item.kind === "skill" && item.skillId === creatorSkillId)).toBe(true)
  })

  it("builds context items from attachments and knowledge bases", () => {
    const artifacts = buildArtifactPaletteItems(
      {
        group: {
          items: [
            {
              kind: "file",
              mime: "text/markdown",
              name: "notes.md",
              path: "/tmp/artifacts/notes.md",
              size: 12,
            },
            {
              kind: "file",
              mime: "image/png",
              name: "corgi.png",
              path: "/tmp/artifacts/corgi.png",
              size: 42,
            },
          ],
          totalItems: 2,
          truncated: false,
        },
        messageId: "assistant-1",
        selectedPath: "/tmp/artifacts/corgi.png",
      },
      t,
    )
    const knowledgeItems = buildKnowledgePaletteItems(
      [knowledgeBase("journey", "Journey to the West", 1, ["Wu Cheng'en"], "People's Literature")],
      [],
      knowledgePaletteCopy,
      { error: false, loading: false },
    )
    const items = buildContextPaletteItems({
      artifactItems: artifacts,
      knowledgeItems,
      t,
    })

    expect(items.map((item) => item.id)).toEqual([
      "knowledge:wikg://lib",
      "knowledge:journey",
      "context:attach-file",
      "context:attach-folder",
      "artifact:/tmp/artifacts/corgi.png",
      "artifact:/tmp/artifacts/notes.md",
    ])
  })

  it("orders selected knowledge first and searches book metadata", () => {
    const items = buildKnowledgePaletteItems(
      [
        knowledgeBase("recent", "Modern Essays", 20, ["Lin Yu"], "Literature Press"),
        knowledgeBase("journey", "Journey to the West", 10, ["Wu Cheng'en"], "People's Literature"),
      ],
      ["journey"],
      knowledgePaletteCopy,
      { error: false, loading: false },
    )

    expect(items.map((item) => item.id)).toEqual(["knowledge:wikg://lib", "knowledge:journey", "knowledge:recent"])
    expect(items[1]).toMatchObject({
      description: "journey.wikg · Wu Cheng'en · People's Literature",
      kind: "knowledge",
      meta: "Referenced",
      scope: "archive",
      selected: true,
    })
    expect(filterComposerPaletteItems(items, "cheng").map((item) => item.id)).toEqual(["knowledge:journey"])
    expect(filterComposerPaletteItems(items, "people").map((item) => item.id)).toEqual(["knowledge:journey"])
  })

  it("keeps existing context actions visible before the rest of a large library", () => {
    const knowledgeItems = buildKnowledgePaletteItems(
      Array.from({ length: 6 }, (_, index) => knowledgeBase(`book-${index}`, `Book ${index}`, 10 - index)),
      [],
      knowledgePaletteCopy,
      { error: false, loading: false },
    )
    const items = buildContextPaletteItems({ knowledgeItems, t })

    expect(items.map((item) => item.id)).toEqual([
      "knowledge:wikg://lib",
      "knowledge:book-0",
      "knowledge:book-1",
      "knowledge:book-2",
      "context:attach-file",
      "context:attach-folder",
      "knowledge:book-3",
      "knowledge:book-4",
      "knowledge:book-5",
    ])
    expect(filterComposerPaletteItems(items, "Book 5").map((item) => item.id)).toEqual(["knowledge:book-5"])
  })

  it("offers global knowledge context when the library is empty, and management when unavailable", () => {
    const empty = buildKnowledgePaletteItems([], [], knowledgePaletteCopy, { error: false, loading: false })
    const loading = buildKnowledgePaletteItems([], [], knowledgePaletteCopy, { error: false, loading: true })
    const failed = buildKnowledgePaletteItems([], [], knowledgePaletteCopy, { error: true, loading: false })

    expect(empty[0]).toMatchObject({
      kind: "knowledge",
      scope: "library",
      title: "Knowledge library",
    })
    expect(empty[0]).not.toHaveProperty("disabled")
    expect(loading[0]).toMatchObject({
      disabled: true,
      title: "Loading knowledge bases",
    })
    expect(failed[0]).toMatchObject({
      title: "Knowledge bases are unavailable",
    })
    expect(failed[0]).not.toHaveProperty("disabled")
  })

  it("merges file and folder context actions on macOS", () => {
    const items = buildContextPaletteItems({ platform: "darwin", t })

    expect(items.map((item) => item.id)).toEqual(["context:attach-file-or-folder"])
    expect(items[0]).toMatchObject({
      action: "attach-file-or-folder",
      meta: "file/folder",
      title: "Add file or folder",
    })
  })
})

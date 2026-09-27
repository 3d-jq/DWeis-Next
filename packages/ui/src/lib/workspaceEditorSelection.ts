import type { EditorInfo } from "@zcode/shared";
import { sortInstalledEditorsForOpenWith } from "@/lib/openWithEditors.js";

// DWeis Next 无云绑定：SSH/WSL 远程编辑器偏好列表已随远程工作区摘除。

type WorkspaceEditorSelectionKind = "preferred" | "fallback" | "empty" | "explicit";

interface WorkspaceEditorSelectionState {
  availableEditors: EditorInfo[];
  selectedEditor: EditorInfo | null;
  selectionKind: Exclude<WorkspaceEditorSelectionKind, "explicit">;
}

export function resolveWorkspaceFileManagerEditor(
  availableEditors: EditorInfo[],
  _remoteTarget?: unknown,
): EditorInfo | null {
  // DWeis Next 无云绑定：remoteTarget 已随远程工作区摘除；本地路径
  // 仍允许 Explorer 作为文件管理器入口，与“打开方式”共用同一编辑器解析。
  return availableEditors.find((editor) => editor.id === "explorer") ?? null;
}

function filterEditorsByIdOrder(
  installedEditors: EditorInfo[],
  orderedIds: string[],
): EditorInfo[] {
  return orderedIds
    .map((id) => installedEditors.find((editor) => editor.id === id) ?? null)
    .filter((editor): editor is EditorInfo => editor !== null);
}

export function resolveWorkspaceEditorSelection({
  installedEditors,
  selectedEditorId,
  remoteTarget,
}: {
  installedEditors: EditorInfo[];
  selectedEditorId: string | null;
  // DWeis Next 无云绑定：remoteTarget 仅保留兼容旧调用方签名，本地路径恒走完整编辑器列表。
  remoteTarget?: unknown;
}): WorkspaceEditorSelectionState {
  const availableEditors: EditorInfo[] = sortInstalledEditorsForOpenWith(installedEditors);
  const preferredEditor =
    selectedEditorId === null
      ? null
      : (availableEditors.find((editor) => editor.id === selectedEditorId) ?? null);
  const fallbackEditor = availableEditors[0] ?? null;

  if (preferredEditor) {
    return {
      availableEditors,
      selectedEditor: preferredEditor,
      selectionKind: "preferred",
    };
  }

  return {
    availableEditors,
    selectedEditor: fallbackEditor,
    selectionKind: fallbackEditor ? "fallback" : "empty",
  };
}

export function shouldPersistWorkspaceEditorSelection(
  selectionKind: WorkspaceEditorSelectionKind,
): boolean {
  // SSH 工作区可能因为过滤本地 App 自动 fallback 到 VS Code。
  // 这种 fallback 不是用户显式选择，不能覆盖本地工作区继续使用的全局编辑器偏好。
  return selectionKind === "explicit";
}

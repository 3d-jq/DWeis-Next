export const metadataFileName = ".oo-metadata.json"
export const manifestSchemaVersion = 1

export const skippedDirectoryNames = new Set([
  ".git",
  ".DS_Store",
  "node_modules",
  "__pycache__",
  ".cache",
  "dist",
  "build",
  // 虚拟环境/编辑器目录：文件量大且与技能内容无关，跳过可显著加快技能扫描哈希
  ".venv",
  "venv",
  ".idea",
  ".vscode",
])

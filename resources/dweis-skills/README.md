# DWeis 内置技能

本目录是 DWeis Next 自带的只读技能，构建期由 `scripts/skills.ts` 导出到 `resources/skills/`，
运行时由 `electron/agent/workspace.ts` 拷进 OpenCode workspace 的 `.opencode/skill/`，
使 DWeis agent 直接可用（并在设置 → 技能中可见）。

## 技能清单

- `browser` — 集成可见浏览器的 agent 控制
- `skill-creator` — 指导创建 SKILL.md 技能
- `wikigraph-knowledge` — 本地知识库索引/搜索/图谱
- `pptx-generator` — PowerPoint 生成/编辑（PptxGenJS + XML 工作流）
- `minimax-docx` — Word 文档创建/编辑/格式化（OpenXML SDK, .NET）
- `minimax-xlsx` — Excel 全套（创建/读取/编辑/公式/财务格式）
- `minimax-pdf` — PDF 生成（视觉质量 + 设计规范）

## 第三方来源

`pptx-generator` / `minimax-docx` / `minimax-xlsx` / `minimax-pdf` 来自
[MiniMax-AI/skills](https://github.com/MiniMax-AI/skills)（MIT License）。
`minimax-docx` 目录内含其独立 LICENSE；其余三个以仓库根 LICENSE（MIT）为准。

这些技能的部分脚本依赖运行环境：`pptx-generator` 需 Node.js（PptxGenJS）+ Python（markitdown），
`minimax-docx` 需 .NET SDK，`minimax-xlsx` 需 Python + pandas，`minimax-pdf` 需 Python + Node.js。
首次使用时技能会引导安装依赖。

import re

def cut_block(src, start_re, end_re):
    m_start = re.search(start_re, src)
    assert m_start, f"start not found: {start_re[:50]}"
    m_end = re.search(end_re, src[m_start.end():])
    assert m_end, f"end not found: {end_re[:50]}"
    end_abs = m_start.end() + m_end.start()
    return src[:m_start.start()] + src[end_abs:]

def drop_import(src, path_variants):
    for v in path_variants:
        src = re.sub(r'import \{[^}]+\} from "' + re.escape(v) + r'";\r?\n', "", src)
    return src

# --- skillSyncService.ts ---
p = "packages/services/src/skill-sync/skillSyncService.ts"
src = open(p, encoding="utf-8").read()
src = cut_block(
    src,
    r"[ \t]*async listRemoteUserSkillStatuses\(params\): Promise<SkillSyncRemoteStatusResult> \{",
    r"[ \t]*async importSkillsArchive\(params\): Promise<SkillSyncImportResult> \{",
)
src = cut_block(
    src,
    r"[ \t]*async checkRemoteUserSkillWriteAccess\(\) \{[\s\S]*?\},\r?\n",
    r"[ \t]*async importSkillsArchive\(params\): Promise<SkillSyncImportResult> \{",
)
src = drop_import(src, ["../remote-sync/remoteSyncWriteAccess.js"])
open(p, "w", encoding="utf-8").write(src)
print("skillSyncService cleaned")

# --- mcpSyncService.ts ---
p = "packages/services/src/mcp-sync/mcpSyncService.ts"
src = open(p, encoding="utf-8").read()
src = cut_block(
    src,
    r"[ \t]*async listRemoteUserMcpStatuses\(params\) \{",
    r"[ \t]*async checkRemoteUserMcpWriteAccess\(\) \{",
)
src = cut_block(
    src,
    r"[ \t]*async checkRemoteUserMcpWriteAccess\(\) \{[\s\S]*?\},\r?\n",
    r"[ \t]*async [a-zA-Z]+\(",
)
src = drop_import(src, ["../remote-sync/remoteSyncWriteAccess.js"])
open(p, "w", encoding="utf-8").write(src)
print("mcpSyncService cleaned")

# --- pluginSyncService.ts ---
p = "packages/services/src/plugin-sync/pluginSyncService.ts"
src = open(p, encoding="utf-8").read()
src = cut_block(
    src,
    r"[ \t]*async listRemoteUserPluginStatuses\(",
    r"[ \t]*async checkRemoteUserPluginWriteAccess\(",
)
src = cut_block(
    src,
    r"[ \t]*async checkRemoteUserPluginWriteAccess\(\) \{[\s\S]*?\},\r?\n",
    r"[ \t]*async [a-zA-Z]+\(",
)
src = drop_import(src, ["../remote-sync/remoteSyncWriteAccess.js"])
open(p, "w", encoding="utf-8").write(src)
print("pluginSyncService cleaned")

# --- 三个接口文件：删远程方法声明与类型导入 ---
for p, drop in [
    ("packages/services/src/skill-sync/skillSync.ts", [
        r"[ \t]*listRemoteUserSkillStatuses\([\s\S]*?\}?: Promise<SkillSyncRemoteStatusResult>;\n",
        r"[ \t]*checkRemoteUserSkillWriteAccess\(\): Promise<RemoteSyncWriteAccessResult>;\n",
        r"  SkillSyncRemoteStatusResult,\n",
        r"  RemoteSyncWriteAccessResult,\n",
    ]),
    ("packages/services/src/mcp-sync/mcpSync.ts", [
        r"[ \t]*listRemoteUserMcpStatuses\([\s\S]*?\}?: Promise<McpSyncRemoteStatusResult>;\n",
        r"[ \t]*checkRemoteUserMcpWriteAccess\(\): Promise<RemoteSyncWriteAccessResult>;\n",
        r"  McpSyncRemoteStatusResult,\n",
        r"  RemoteSyncWriteAccessResult,\n",
    ]),
    ("packages/services/src/plugin-sync/pluginSync.ts", [
        r"[ \t]*listRemoteUserPluginStatuses\([\s\S]*?\}?: Promise<PluginSyncRemoteStatusResult>;\n",
        r"[ \t]*checkRemoteUserPluginWriteAccess\(\): Promise<RemoteSyncWriteAccessResult>;\n",
        r"  PluginSyncRemoteStatusResult,\n",
        r"  RemoteSyncWriteAccessResult,\n",
    ]),
]:
    src = open(p, encoding="utf-8").read()
    for pat in drop:
        src = re.sub(pat, "", src)
    open(p, "w", encoding="utf-8").write(src)
    print(f"{p} cleaned")

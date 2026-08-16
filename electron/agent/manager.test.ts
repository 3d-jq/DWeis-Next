import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AgentManager,
  buildAgentSidecarEnv,
  buildArtifactSystem,
  isUserVisibleSession,
  turnArtifactMarkerPath,
} from "./manager.ts"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("AgentManager", () => {
  it("hides OpenCode subagent sessions from the user task list", () => {
    expect(isUserVisibleSession({ id: "root", title: "Root" })).toBe(true)
    expect(isUserVisibleSession({ id: "child", parentID: "root", title: "Child" })).toBe(false)
    expect(isUserVisibleSession({ id: "child", parentId: "root", title: "Child" })).toBe(false)
    expect(isUserVisibleSession({ id: "child", parent_id: "root", title: "Child" })).toBe(false)
  })

  it("does not expose DWeis WikiGraph control variables to the sidecar", () => {
    const env = buildAgentSidecarEnv({
      commandPath: "/usr/bin:/bin",
      storeDir: "/tmp/dweis-agent/oo-store",
      teamScopePath: "/tmp/dweis-agent/team-scope.json",
    })

    expect(env).toMatchObject({
      DWEIS_TEAM_SCOPE_PATH: "/tmp/dweis-agent/team-scope.json",
      PATH: "/usr/bin:/bin",
    })
    expect(env).not.toHaveProperty("DWEIS_WIKIGRAPH_COMMAND")
    expect(env).not.toHaveProperty("DWEIS_WIKIGRAPH_STATE_DIR")
    expect(env).not.toHaveProperty("DWEIS_WIKIGRAPH_WRAPPER_PATH")
    expect(env).not.toHaveProperty("WIKIGRAPH_STATE_DIR")
  })

  it("points generate_image at the per-agent turn artifact marker", () => {
    const env = buildAgentSidecarEnv({
      commandPath: "/usr/bin:/bin",
      storeDir: "/tmp/dweis-agent/oo-store",
      teamScopePath: "/tmp/dweis-agent/team-scope.json",
    })

    expect(env.DWEIS_TURN_ARTIFACT_PATH).toBe(turnArtifactMarkerPath("/tmp/dweis-agent/oo-store"))
    expect(turnArtifactMarkerPath("/tmp/dweis-agent/oo-store")).toBe(
      path.join("/tmp/dweis-agent/oo-store", "turn-artifact-dir.json"),
    )
  })

  it("keeps artifact directories inside the artifacts root", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "dweis-agent-"))
    try {
      const manager = new AgentManager({
        opencodeBinPath: "/tmp/opencode",
        rootDir,
      })

      const dir = await manager.createArtifactDir("..")
      const artifactsRoot = path.resolve(rootDir, "artifacts")
      const relative = path.relative(artifactsRoot, dir)

      expect(relative).not.toBe("..")
      expect(relative.startsWith(`..${path.sep}`)).toBe(false)
      expect(path.isAbsolute(relative)).toBe(false)
    } finally {
      await rm(rootDir, { force: true, recursive: true })
    }
  })

  it("stores project artifacts under the selected project", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "dweis-agent-"))
    const projectRoot = await mkdtemp(path.join(tmpdir(), "dweis-project-"))
    try {
      const manager = new AgentManager({
        opencodeBinPath: "/tmp/opencode",
        rootDir,
      })

      const dir = await manager.createArtifactDir("session/one", projectRoot)
      const resolvedProjectRoot = await realpath(projectRoot)
      const sessionRoot = path.join(resolvedProjectRoot, ".dweis", "artifacts", "session_one")
      const relative = path.relative(sessionRoot, dir)

      expect(relative).not.toBe("..")
      expect(relative.startsWith(`..${path.sep}`)).toBe(false)
      expect(path.isAbsolute(relative)).toBe(false)
      await expect(realpath(manager.artifactSessionDir("session/one", projectRoot))).resolves.toBe(sessionRoot)
    } finally {
      await Promise.all([
        rm(rootDir, { force: true, recursive: true }),
        rm(projectRoot, { force: true, recursive: true }),
      ])
    }
  })

  it.skipIf(process.platform === "win32")("rejects symbolic links in the project artifact path", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "dweis-agent-"))
    const projectRoot = await mkdtemp(path.join(tmpdir(), "dweis-project-"))
    const outsideRoot = await mkdtemp(path.join(tmpdir(), "dweis-outside-"))
    try {
      const manager = new AgentManager({
        opencodeBinPath: "/tmp/opencode",
        rootDir,
      })
      await symlink(outsideRoot, path.join(projectRoot, ".dweis"), "dir")

      await expect(manager.createArtifactDir("session", projectRoot)).rejects.toThrow(
        "Project artifact path contains a non-directory or symbolic link.",
      )
    } finally {
      await Promise.all([
        rm(rootDir, { force: true, recursive: true }),
        rm(projectRoot, { force: true, recursive: true }),
        rm(outsideRoot, { force: true, recursive: true }),
      ])
    }
  })

  it.skipIf(process.platform === "win32")("rejects a symbolic link used as the project root", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "dweis-agent-"))
    const projectRoot = await mkdtemp(path.join(tmpdir(), "dweis-project-"))
    const linkedProjectRoot = path.join(tmpdir(), `dweis-project-link-${Date.now()}`)
    try {
      const manager = new AgentManager({
        opencodeBinPath: "/tmp/opencode",
        rootDir,
      })
      await symlink(projectRoot, linkedProjectRoot, "dir")

      await expect(manager.createArtifactDir("session", linkedProjectRoot)).rejects.toThrow(
        "Project artifact root is not a directory.",
      )
    } finally {
      await Promise.all([
        rm(rootDir, { force: true, recursive: true }),
        rm(projectRoot, { force: true, recursive: true }),
        rm(linkedProjectRoot, { force: true, recursive: true }),
      ])
    }
  })

  it("keeps image previews visible independently from artifact persistence", () => {
    const system = buildArtifactSystem("/tmp/dweis-artifacts/turn")

    expect(system).toContain("both are required for every final generated image")
    expect(system).toContain("keep that preview visible")
    expect(system).toContain("DWeis Next can materialize the same image")
    expect(system).toContain("replace every embedded output path")
    expect(system).not.toContain("Do not present a remote")
  })

  it("tells project turns that managed deliverables are published into the visible project", () => {
    const system = buildArtifactSystem("/tmp/project/.dweis/artifacts/session/turn", "/tmp/project")

    expect(system).toContain("DWeis Next will publish final deliverables")
    expect(system).toContain("/tmp/project")
    expect(system).toContain("descriptive user-facing file and directory names")
    expect(system).toContain("Do not write a second copy directly into the project directory")
    expect(system).toContain("Do not present the managed artifact path as the final project location")
  })

  it("persists per-session knowledge base scope in team-scope.json", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "dweis-agent-"))
    try {
      const manager = new AgentManager({
        opencodeBinPath: "/tmp/opencode",
        rootDir,
      })
      const scopePath = path.join(rootDir, "team-scope.json")
      ;(manager as unknown as { teamScopePath: string }).teamScopePath = scopePath

      await manager.setSessionKnowledgeBaseIds("session-a", [" knowledge-a ", "knowledge-a", "knowledge-b"])
      await manager.inheritSessionKnowledgeBaseIds("session-a", "session-child")

      await expect(readFile(scopePath, "utf8").then((content) => JSON.parse(content))).resolves.toEqual({
        sessionKnowledgeBaseIds: {
          "session-a": ["knowledge-a", "knowledge-b"],
          "session-child": ["knowledge-a", "knowledge-b"],
        },
      })

      await manager.removeKnowledgeBaseAccess("knowledge-a")
      await manager.clearSessionKnowledgeBaseIds("session-child")

      await expect(readFile(scopePath, "utf8").then((content) => JSON.parse(content))).resolves.toEqual({
        sessionKnowledgeBaseIds: {
          "session-a": ["knowledge-b"],
        },
      })
    } finally {
      await rm(rootDir, { force: true, recursive: true })
    }
  })

  it("passes OpenCode agent names and reasoning variants to promptAsync", async () => {
    const promptAsync = vi.fn(async () => ({ data: true }))
    const manager = new AgentManager({
      customModels: [
        {
          id: "local-model",
          providerId: "custom",
          providerName: "Local",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "local-key",
          apiKeyConfigured: true,
          modelName: "local-model",
        },
      ],
      defaultModel: { kind: "custom", id: "local-model" },
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown }).sidecar = { client: { session: { promptAsync } } }
    await manager.promptStreaming("session-1", "plan it", {
      mode: "plan",
      reasoningLevel: "high",
    })
    await manager.promptStreaming("session-1", "build it", {
      reasoningLevel: "medium",
    })
    await manager.promptStreaming("session-1", "default reasoning", {
      reasoningLevel: "default",
    })

    const calls = promptAsync.mock.calls as unknown as Array<[parameters: { agent?: string; variant?: string }]>
    expect(calls[0]?.[0].agent).toBe("plan")
    expect(calls[0]?.[0].variant).toBe("high")
    expect(calls[1]?.[0].agent).toBe("build")
    expect(calls[1]?.[0].variant).toBe("medium")
    expect(calls[2]?.[0]).not.toHaveProperty("variant")
  })

  it("does not send an unconverted XLSX binary to the model provider", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dweis-attachment-manager-"))
    const workbookPath = path.join(directory, "库存表.xlsx")
    await writeFile(workbookPath, "test workbook")
    const promptAsync = vi.fn(async () => ({ data: true }))
    const manager = new AgentManager({
      customModels: [
        {
          id: "local-model",
          providerId: "custom",
          providerName: "Local",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "local-key",
          apiKeyConfigured: true,
          modelName: "local-model",
        },
      ],
      defaultModel: { kind: "custom", id: "local-model" },
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown }).sidecar = { client: { session: { promptAsync } } }

    try {
      await manager.promptStreaming("session-1", "整理表格", {
        attachments: [
          {
            id: "xlsx-1",
            mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            name: "库存表.xlsx",
            path: workbookPath,
            size: 1024,
          },
        ],
      })

      const calls = promptAsync.mock.calls as unknown as Array<
        [
          {
            parts: Array<{
              metadata?: Record<string, unknown>
              mime?: string
              synthetic?: boolean
              text?: string
              type: string
            }>
          },
        ]
      >
      const call = calls[0]?.[0]
      expect(call).toBeDefined()
      if (!call) throw new Error("Expected promptAsync to be called")
      expect(call.parts).not.toContainEqual(
        expect.objectContaining({
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          type: "file",
        }),
      )
      expect(call.parts[0]).toMatchObject({
        metadata: { dweisPurpose: "attachment-reference", dweisVisibility: "internal" },
        synthetic: true,
        type: "text",
        text: expect.stringContaining("not safe to pass through"),
      })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("normalizes structured text and applies the selected model's image capability", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dweis-attachment-manager-"))
    const jsonPath = path.join(directory, "data.json")
    const imagePath = path.join(directory, "photo.png")
    await Promise.all([writeFile(jsonPath, "{}"), writeFile(imagePath, "test image")])
    const promptAsync = vi.fn(async () => ({ data: true }))
    const manager = new AgentManager({
      customModels: [
        {
          id: "deepseek-byok",
          providerId: "deepseek",
          providerName: "DeepSeek",
          baseUrl: "https://api.deepseek.test/v1",
          apiKey: "custom-key",
          apiKeyConfigured: true,
          modelName: "deepseek-v4-flash",
          supportsImages: false,
        },
        {
          id: "deepseek-vision",
          providerId: "deepseek",
          providerName: "DeepSeek",
          baseUrl: "https://api.deepseek.test/v1",
          apiKey: "custom-key",
          apiKeyConfigured: true,
          modelName: "deepseek-vision",
          supportsImages: true,
        },
      ],
      defaultModel: { kind: "custom", id: "deepseek-byok" },
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown }).sidecar = { client: { session: { promptAsync } } }
    const json = {
      id: "json-1",
      mime: "application/json",
      name: "data.json",
      path: jsonPath,
      size: 100,
    }
    const image = {
      id: "image-1",
      mime: "image/png",
      name: "photo.png",
      path: imagePath,
      size: 100,
    }

    try {
      await manager.promptStreaming("session-1", "analyze", {
        attachments: [json, image],
        model: { kind: "custom", id: "deepseek-byok" },
      })
      await manager.promptStreaming("session-1", "analyze", {
        attachments: [image],
        model: { kind: "custom", id: "deepseek-vision" },
      })

      const calls = promptAsync.mock.calls as unknown as Array<
        [
          {
            parts: Array<{
              metadata?: Record<string, unknown>
              mime?: string
              synthetic?: boolean
              text?: string
              type: string
            }>
          },
        ]
      >
      expect(calls[0]?.[0].parts[0]).toMatchObject({ mime: "text/plain", type: "file" })
      expect(calls[0]?.[0].parts[1]).toMatchObject({
        metadata: { dweisPurpose: "attachment-reference", dweisVisibility: "internal" },
        synthetic: true,
        type: "text",
        text: expect.stringContaining("does not support image input"),
      })
      expect(calls[1]?.[0].parts[0]).toMatchObject({ mime: "image/png", type: "file" })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("uses the local default custom model for prompt choices and capability checks without an explicit model", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dweis-local-model-manager-"))
    const imagePath = path.join(directory, "photo.png")
    await writeFile(imagePath, "test image")
    const promptAsync = vi.fn(async (_parameters: unknown) => ({ data: true }))
    const manager = new AgentManager({
      customModels: [
        {
          apiKey: "local-secret",
          apiKeyConfigured: true,
          baseUrl: "http://127.0.0.1:11434/v1",
          id: "local-default",
          modelName: "local-model",
          providerId: "custom",
          providerName: "Local",
          reasoningVariants: ["low"],
          supportsImages: false,
        },
      ],
      defaultModel: { kind: "custom", id: "local-default" },
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown }).sidecar = { client: { session: { promptAsync } } }

    try {
      await manager.promptStreaming("session-1", "analyze", {
        attachments: [{ id: "image-1", mime: "image/png", name: "photo.png", path: imagePath, size: 100 }],
        reasoningLevel: "high",
      })

      const call = promptAsync.mock.calls[0]?.[0] as
        | {
            model?: { modelID: string; providerID: string }
            parts?: Array<{
              metadata?: Record<string, unknown>
              synthetic?: boolean
              text?: string
              type: string
            }>
            variant?: string
          }
        | undefined
      expect(call?.model).toEqual({ modelID: "local-model", providerID: "dweis-custom-local-default" })
      // 用户档位 high 超出模型支持范围（仅 low）→ 钳制到 low（不再丢弃：丢弃会让模型默认思考内联、思考裸露）。
      expect(call?.variant).toBe("low")
      expect(call?.parts?.[0]).toMatchObject({
        metadata: { dweisPurpose: "attachment-reference", dweisVisibility: "internal" },
        synthetic: true,
        type: "text",
        text: expect.stringContaining("does not support image input"),
      })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("restarts the OpenCode event stream after an unexpected disconnect", async () => {
    vi.useFakeTimers()
    const subscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error("stream disconnected"))
      .mockResolvedValueOnce({
        stream: (async function* () {
          yield { type: "session.idle", properties: { sessionID: "session-1" } }
        })(),
      })
    const manager = new AgentManager({
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown; started: boolean }).sidecar = {
      client: { event: { subscribe } },
    }
    ;(manager as unknown as { started: boolean }).started = true

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = []
    const statuses: string[] = []
    const unsubscribe = manager.subscribe(
      (event) => events.push(event),
      (status) => statuses.push(status.status),
    )

    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledTimes(1)
      expect(statuses).toContain("reconnecting")
    })
    expect(statuses).not.toContain("failed")

    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledTimes(2)
      expect(events).toEqual([{ type: "session.idle", properties: { sessionID: "session-1" } }])
    })

    unsubscribe()
  })

  it("reports a failed OpenCode event stream after reconnect attempts are exhausted", async () => {
    vi.useFakeTimers()
    const subscribe = vi.fn().mockRejectedValue(new Error("stream disconnected"))
    const manager = new AgentManager({
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown; started: boolean }).sidecar = {
      client: { event: { subscribe } },
    }
    ;(manager as unknown as { started: boolean }).started = true

    const statuses: Array<{ attempt?: number; status: string }> = []
    const unsubscribe = manager.subscribe(
      () => undefined,
      (status) => statuses.push({ attempt: status.attempt, status: status.status }),
    )

    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledTimes(1)
      expect(statuses).toContainEqual({ attempt: 1, status: "reconnecting" })
    })

    const delays = [500, 1_000, 2_000, 4_000, 5_000]
    for (const [index, delay] of delays.entries()) {
      await vi.advanceTimersByTimeAsync(delay)
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(index + 2)
      })
    }

    await vi.waitFor(() => {
      expect(statuses.at(-1)).toEqual({ attempt: 5, status: "failed" })
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(subscribe).toHaveBeenCalledTimes(6)

    unsubscribe()
  })

  it("uses runtime question APIs for pending questions and replies", async () => {
    const list = vi.fn(async () => ({
      data: [
        {
          id: "q1",
          sessionID: "session-1",
          questions: [{ header: "Answer", question: "Pick one", options: [{ label: "A" }] }],
        },
        {
          id: "q2",
          sessionID: "session-2",
          questions: [{ header: "Answer", question: "Pick two", options: [{ label: "B" }] }],
        },
      ],
    }))
    const reply = vi.fn(async () => ({ data: true }))
    const reject = vi.fn(async () => ({ data: true }))
    const manager = new AgentManager({
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown; started: boolean }).sidecar = {
      client: { question: { list, reject, reply } },
    }
    ;(manager as unknown as { started: boolean }).started = true

    await expect(manager.getPendingQuestions("session-1")).resolves.toEqual([
      {
        id: "q1",
        sessionId: "session-1",
        questions: [{ header: "Answer", question: "Pick one", options: [{ label: "A" }] }],
      },
    ])
    await manager.answerQuestion("session-1", "q1", [["A"]])
    await manager.rejectQuestion("session-1", "q1")
    await expect(manager.getPendingQuestionsForSessions(["session-1", "session-2"])).resolves.toHaveLength(2)

    expect(list).toHaveBeenCalledTimes(2)
    expect(reply).toHaveBeenCalledWith({
      requestID: "q1",
      answers: [["A"]],
    })
    expect(reject).toHaveBeenCalledWith({ requestID: "q1" })
  })

  it("turns OpenCode SDK error results into rejected operations", async () => {
    const failure = async () => ({ error: { message: "runtime unavailable" } })
    const manager = new AgentManager({
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })
    ;(manager as unknown as { sidecar: unknown; started: boolean }).sidecar = {
      client: {
        permission: { list: failure, reply: failure },
        question: { list: failure, reject: failure, reply: failure },
        session: {
          abort: failure,
          delete: failure,
          list: failure,
          messages: failure,
          update: failure,
        },
      },
    }
    ;(manager as unknown as { started: boolean }).started = true

    await expect(manager.listSessions()).rejects.toThrow("session.list failed")
    await expect(manager.getMessages("session-1")).rejects.toThrow("session.messages failed")
    await expect(manager.renameSession("session-1", "Title")).rejects.toThrow("session.update failed")
    await expect(manager.deleteSession("session-1")).rejects.toThrow("session.delete failed")
    await expect(manager.abort("session-1")).rejects.toThrow("session.abort failed")
    await expect(manager.getPendingQuestions("session-1")).rejects.toThrow("question.list failed")
    await expect(manager.answerQuestion("session-1", "question-1", [["answer"]])).rejects.toThrow(
      "question.reply failed",
    )
    await expect(manager.rejectQuestion("session-1", "question-1")).rejects.toThrow("question.reject failed")
    await expect(manager.getPendingPermissions("session-1")).rejects.toThrow("permission.list failed")
    await expect(manager.answerPermission("session-1", "permission-1", "once")).rejects.toThrow(
      "permission.reply failed",
    )
  })

  it("uses the selected custom model endpoint and credential to generate a session title", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"自定义模型标题"}' } }] }), {
        status: 200,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const manager = new AgentManager({
      customModels: [
        {
          apiKey: "custom-secret",
          apiKeyConfigured: true,
          baseUrl: "https://models.example.test/v1/",
          id: "custom-1",
          modelName: "custom-model",
          providerId: "openrouter",
          providerName: "Custom provider",
        },
      ],
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })

    const title = await manager.generateSessionTitle({
      model: { kind: "custom", id: "custom-1" },
      text: "帮我分析一下注册来源",
    })

    expect(title).toEqual({ generated: true, title: "自定义模型标题" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe("https://models.example.test/v1/chat/completions")
    expect(request?.headers).toMatchObject({ Authorization: "Bearer custom-secret" })
    expect(JSON.parse(String(request?.body))).toMatchObject({ model: "custom-model" })
  })

  it("uses the local default custom model for a title without an explicit model", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"本地模型标题"}' } }] }), {
        status: 200,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const manager = new AgentManager({
      customModels: [
        {
          apiKey: "local-secret",
          apiKeyConfigured: true,
          baseUrl: "http://127.0.0.1:11434/v1/",
          id: "local-default",
          modelName: "local-model",
          providerId: "custom",
          providerName: "Local",
        },
      ],
      defaultModel: { kind: "custom", id: "local-default" },
      opencodeBinPath: "/tmp/opencode",
      rootDir: "/tmp/dweis-agent",
    })

    const title = await manager.generateSessionTitle({
      text: "生成标题",
    })

    expect(title).toEqual({ generated: true, title: "本地模型标题" })
    const [url, request] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe("http://127.0.0.1:11434/v1/chat/completions")
    expect(request?.headers).toMatchObject({ Authorization: "Bearer local-secret" })
    expect(JSON.parse(String(request?.body))).toMatchObject({ model: "local-model" })
  })
})

describe("AgentManager.updateCustomModels", () => {
  it("refreshes the model snapshot immediately without waiting for a restart", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "dweis-agent-models-"))
    try {
      const oldModel = {
        id: "old-1",
        providerId: "custom",
        providerName: "自定义",
        baseUrl: "https://old.example.com/v1",
        apiKey: "sk-old",
        apiKeyConfigured: true,
        modelName: "old-model",
        supportsImages: false,
        supportsToolCalls: true,
      }
      const newModel = {
        ...oldModel,
        id: "new-1",
        baseUrl: "https://new.example.com/v1",
        apiKey: "sk-new",
        modelName: "new-model",
      }
      const manager = new AgentManager({
        opencodeBinPath: "/tmp/opencode",
        rootDir,
        customModels: [oldModel],
      })
      const resolve = (
        manager as unknown as {
          resolveModel: (choice: { kind: "custom"; id: string }) => { providerID: string; modelID: string }
        }
      ).resolveModel.bind(manager)

      expect(() => resolve({ kind: "custom", id: "new-1" })).toThrow("Selected custom model is no longer available")

      manager.updateCustomModels([oldModel, newModel])
      expect(resolve({ kind: "custom", id: "new-1" })).toEqual({
        providerID: "dweis-custom-new-1",
        modelID: "new-model",
      })
    } finally {
      await rm(rootDir, { force: true, recursive: true })
    }
  })
})

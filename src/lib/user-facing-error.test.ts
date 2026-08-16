import { describe, expect, it } from "vitest"
import { resolveUserFacingError } from "./user-facing-error.ts"

describe("resolveUserFacingError", () => {
  it("classifies auth, rate limit, and server errors", () => {
    expect(resolveUserFacingError("HTTP 401 unauthorized", { area: "auth" })).toMatchObject({
      kind: "auth_required",
      titleKey: "chatError.modelAuthRequired.title",
    })
    expect(resolveUserFacingError('{"status":429,"message":"too many requests"}')).toMatchObject({
      kind: "rate_limited",
      severity: "warning",
    })
    expect(resolveUserFacingError("Connector request failed with status 503", { area: "chat" })).toMatchObject({
      kind: "server_unavailable",
      descriptionKey: "error.serverUnavailable.description",
    })
  })

  it("classifies 401 as a model-credential prompt regardless of area", () => {
    // 纯本地模式无会话/账单概念：401 一律按模型凭据问题提示。
    expect(resolveUserFacingError("Sign in is required.", { area: "billing" })).toMatchObject({
      kind: "auth_required",
      severity: "info",
      titleKey: "chatError.modelAuthRequired.title",
      descriptionKey: "chatError.modelAuthRequired.description",
    })
    expect(resolveUserFacingError("HTTP 401 unauthorized", { area: "voice" })).toMatchObject({
      kind: "auth_required",
      titleKey: "chatError.modelAuthRequired.title",
    })
  })

  it("maps unreadable WikiGraph imports to product copy without exposing SDK internals", () => {
    expect(
      resolveUserFacingError("DWEIS_KNOWLEDGE_IMPORT_UNREADABLE: Missing chapter key in TOC", { area: "generic" }),
    ).toMatchObject({
      descriptionKey: "error.knowledgeImportUnreadable.description",
      kind: "validation_error",
      severity: "warning",
      titleKey: "error.knowledgeImportUnreadable.title",
    })
  })

  it("keeps artifact file errors scoped to file operations", () => {
    expect(resolveUserFacingError("ENOENT: no such file or directory", { area: "artifact" })).toMatchObject({
      kind: "local_file_unavailable",
    })
    expect(resolveUserFacingError("Connector returned 404 not found", { area: "chat" })).toMatchObject({
      kind: "operation_failed",
      titleKey: "error.chat.title",
    })
  })

  it("keeps objective service and network failures ahead of area fallbacks", () => {
    expect(resolveUserFacingError("HTTP 503 upstream unavailable", { area: "artifact" })).toMatchObject({
      kind: "server_unavailable",
      titleKey: "error.serverUnavailable.title",
    })
    expect(resolveUserFacingError("fetch failed: ECONNREFUSED", { area: "artifact" })).toMatchObject({
      kind: "network_unavailable",
      titleKey: "error.networkUnavailable.title",
    })
    expect(resolveUserFacingError("HTTP 401 unauthorized", { area: "agent" })).toMatchObject({
      kind: "auth_required",
      titleKey: "chatError.modelAuthRequired.title",
    })
    expect(resolveUserFacingError("request cancelled", { area: "agent" })).toMatchObject({
      kind: "cancelled",
      titleKey: "error.cancelled.title",
    })
  })

  it("preserves a short message while keeping extended diagnostics copyable", () => {
    const error = Object.assign(new Error("Package version already exists."), {
      diagnostics: "command: oo skills publish /tmp/demo\nstderr: Package version already exists.",
    })

    expect(resolveUserFacingError(error, { area: "skills", preserveMessage: true })).toMatchObject({
      descriptionText: "Package version already exists.",
      diagnostics: "command: oo skills publish /tmp/demo\nstderr: Package version already exists.",
      kind: "operation_failed",
    })
  })

  it("explains secure model credential storage failures without suggesting plaintext fallback", () => {
    expect(
      resolveUserFacingError(
        "Secure model credential storage requires GNOME Keyring or KWallet on Linux; plaintext fallback is disabled.",
        { area: "model" },
      ),
    ).toMatchObject({
      descriptionKey: "error.secureStorageUnavailable.description",
      kind: "secure_storage_unavailable",
      severity: "warning",
      titleKey: "error.secureStorageUnavailable.title",
    })
  })
})

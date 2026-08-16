import { describe, expect, it } from "vitest"
import { chatErrorRecoveryKind, resolveChatError } from "./chat-error.ts"

describe("resolveChatError", () => {
  it("maps insufficient credit errors to payment_required", () => {
    expect(resolveChatError("Payment Required: account is in deficit, code: INSUFFICIENT_CREDITS").kind).toBe(
      "payment_required",
    )
  })

  it("maps 402 and insufficient-credit variants to payment_required", () => {
    expect(resolveChatError("HTTP 402 insufficient credits").kind).toBe("payment_required")
    expect(resolveChatError('PAYMENT_REQUIRED: {"message":"not enough credits","status":"402"}').kind).toBe(
      "payment_required",
    )
    expect(resolveChatError("CHAT_COMPLETION_PAYMENT_REQUIRED: 当前账户余额不足").kind).toBe("payment_required")
  })

  it("maps common completion failures without treating them as payment errors", () => {
    expect(resolveChatError("CHAT_COMPLETION_TIMEOUT: Request timeout: chat.completion").kind).toBe("timeout")
    expect(resolveChatError("WebSocket connection failed").kind).toBe("connection_interrupted")
    expect(resolveChatError("Permission denied").kind).toBe("permission_denied")
  })

  it("directs a local model 401 to model configuration instead of a sign-in prompt", () => {
    expect(resolveChatError("HTTP 401 invalid API key", { errorKind: "model_auth_required" })).toMatchObject({
      descriptionKey: "chatError.modelAuthRequired.description",
      kind: "model_auth_required",
      retryable: false,
      titleKey: "chatError.modelAuthRequired.title",
    })
    expect(chatErrorRecoveryKind("model_auth_required")).toBeNull()
  })

  it("explains content inspection failures without exposing the provider text as the user-facing message", () => {
    const error = resolveChatError(
      "Input data may contain inappropriate content. (request id: 2026071610124879712460311981024)",
    )

    expect(error).toMatchObject({
      kind: "content_filtered",
      severity: "warning",
      titleKey: "chatError.contentFiltered.title",
      descriptionKey: "chatError.contentFiltered.description",
      primaryActionKey: "chatError.contentFiltered.primaryAction",
      retryable: false,
    })
    expect(error.diagnostics).toContain("2026071610124879712460311981024")
  })

  it("assigns every chat error to an explicit recovery path", () => {
    // 纯本地模式：账单错误只展示、无恢复入口。
    expect(chatErrorRecoveryKind("payment_required")).toBeNull()
    expect(chatErrorRecoveryKind("content_filtered")).toBe("fresh_task")
    expect(chatErrorRecoveryKind("auth_required")).toBe("reauthenticate")
    expect(chatErrorRecoveryKind("permission_denied")).toBe("reauthenticate")
    expect(chatErrorRecoveryKind("model_auth_required")).toBeNull()
    for (const kind of [
      "timeout",
      "connection_interrupted",
      "rate_limited",
      "provider_unavailable",
      "unknown",
    ] as const) {
      expect(chatErrorRecoveryKind(kind)).toBe("current_task")
    }
  })
})

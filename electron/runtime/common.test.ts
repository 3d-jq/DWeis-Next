import { describe, expect, it } from "vitest"
import { resolveRuntimeCapabilities } from "./common.ts"

describe("resolveRuntimeCapabilities", () => {
  it("reports the pure-local capability set when the Agent runtime is available", () => {
    expect(resolveRuntimeCapabilities({ mode: "local", localAgentAvailable: true })).toEqual({
      mode: "local",
      localAgent: true,
      localTools: true,
      customModels: true,
    })
  })

  it("does not claim local tools before the local Agent runtime is available", () => {
    expect(resolveRuntimeCapabilities({ mode: "local", localAgentAvailable: false })).toEqual({
      mode: "local",
      localAgent: false,
      localTools: false,
      customModels: true,
    })
  })
})

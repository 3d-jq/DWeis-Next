type SkillOperationCommand = "skills.install" | "skills.publish" | "skills.uninstall" | "skills.update"

type SkillOperationStatus = "completed" | "failed" | "noop" | "partial-failure"

interface RawSkillOperationResult {
  command?: unknown
  errors?: unknown
  records?: unknown
  skills?: unknown
  status?: unknown
}

interface RawSkillOperationError {
  code?: unknown
  message?: unknown
}

interface RawSkillOperationEntry {
  error?: unknown
  targets?: unknown
}

// CLI mutation targets 通常只有一层；限制深度避免异常响应导致遍历失控。
const skillOperationEntryErrorMaxDepth = 10

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function createDeleteSkillArgs(request: { skillId: string }): string[] {
  const skillId = asRequiredCommandValue(request.skillId, "skillId")
  return ["skills", "uninstall", skillId, "--json"]
}

export function assertSkillOperationSucceeded(stdout: string, expectedCommand: SkillOperationCommand): void {
  const parsed = JSON.parse(stdout) as unknown

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Skill operation returned an unsupported response.")
  }

  const result = parsed as RawSkillOperationResult

  if (result.command !== expectedCommand) {
    throw new Error("Skill operation returned an unexpected command response.")
  }

  if (!isSkillOperationStatus(result.status)) {
    throw new Error("Skill operation returned an unsupported status.")
  }

  if (result.status === "failed" || result.status === "partial-failure") {
    throw new Error(createSkillOperationErrorMessage(result))
  }
}

function isSkillOperationStatus(status: unknown): status is SkillOperationStatus {
  return status === "completed" || status === "failed" || status === "noop" || status === "partial-failure"
}

function createSkillOperationErrorMessage(result: RawSkillOperationResult): string {
  const messages = collectSkillOperationErrorMessages(result)

  return messages[0] ?? "Skill operation failed."
}

function collectSkillOperationErrorMessages(result: RawSkillOperationResult): string[] {
  const messages: string[] = []

  collectSkillOperationErrorList(messages, result.errors)
  collectSkillOperationEntryErrorList(messages, result.skills)
  collectSkillOperationEntryErrorList(messages, result.records)

  return messages
}

function collectSkillOperationErrorList(messages: string[], errors: unknown): void {
  if (!Array.isArray(errors)) {
    return
  }

  for (const error of errors) {
    const message = readSkillOperationErrorMessage(error)
    if (message) {
      messages.push(message)
    }
  }
}

function collectSkillOperationEntryErrorList(messages: string[], entries: unknown): void {
  if (!Array.isArray(entries)) {
    return
  }

  const visited = new Set<object>()
  const stack = entries.map((entry) => ({ depth: 0, entry })).reverse()

  while (stack.length > 0) {
    const { depth, entry } = stack.pop()!
    if (!entry || typeof entry !== "object") {
      continue
    }

    if (visited.has(entry)) {
      continue
    }
    visited.add(entry)

    const rawEntry = entry as RawSkillOperationEntry
    const message = readSkillOperationErrorMessage(rawEntry.error)
    if (message) {
      messages.push(message)
    }

    if (depth >= skillOperationEntryErrorMaxDepth || !Array.isArray(rawEntry.targets)) {
      continue
    }

    for (let index = rawEntry.targets.length - 1; index >= 0; index -= 1) {
      stack.push({ depth: depth + 1, entry: rawEntry.targets[index] })
    }
  }
}

function readSkillOperationErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined
  }

  const raw = error as RawSkillOperationError
  return asText(raw.message) ?? asText(raw.code)
}

function asRequiredCommandValue(value: string, fieldName: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`)
  }

  return trimmed
}

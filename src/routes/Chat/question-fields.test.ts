import type { ChatQuestionRequest } from "../../../electron/chat/common.ts"

import { describe, expect, it } from "vitest"
import {
  answersFromFieldDrafts,
  deriveQuestionFields,
  initialFieldDrafts,
  isQuestionDraftSnapshotPristine,
  questionStepLabel,
} from "./question-fields.ts"

describe("question-fields", () => {
  it("splits a combined Gmail draft question into typed form fields", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "创建 Gmail 草稿",
          question:
            "创建 Gmail 草稿需要以下信息： 1. 收件人邮箱地址是什么？ 2. 邮件主题是什么？ 正文内容已确定为：「测试连接」",
          options: [{ label: "我来自定义", description: "我自己指定收件人和主题" }],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields.map((field) => ({ label: field.label, kind: field.kind, value: field.value }))).toEqual([
      { label: "recipient", kind: "email", value: "" },
      { label: "subject", kind: "text", value: "" },
      { label: "body", kind: "textarea", value: "测试连接" },
    ])
    expect(fields.every((field) => field.options.length === 0)).toBe(true)
  })

  it("serializes split fields back to the original question answer", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "创建 Gmail 草稿",
          question: "1. 收件人邮箱地址是什么？ 2. 邮件主题是什么？ 正文内容已确定为：「测试连接」",
          options: [],
        },
      ],
    }
    const fields = deriveQuestionFields(request)
    const drafts = initialFieldDrafts(fields)
    drafts[0].value = "foo@example.com"
    drafts[1].value = "测试主题"

    expect(answersFromFieldDrafts(request, fields, drafts)).toEqual([
      ["recipient: foo@example.com\nsubject: 测试主题\nbody: 测试连接"],
    ])
  })

  it("keeps numbered prompts authoritative when concrete options are also present", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "创建 Gmail 草稿",
          question: "1. 收件人邮箱地址是什么？ 2. 邮件主题是什么？",
          options: [{ label: "测试连接", description: "主题使用「测试连接」" }],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields.map((field) => ({ label: field.label, kind: field.kind, options: field.options }))).toEqual([
      { label: "recipient", kind: "email", options: [] },
      { label: "subject", kind: "text", options: [] },
    ])
  })

  it("turns field-like options into stable fields and removes duplicates", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "草稿信息",
          question: "创建草稿需要收件人和邮件主题，请提供以下信息：",
          options: [
            { label: "填写收件人", description: "输入收件人的邮箱地址" },
            { label: "填写主题", description: "输入邮件主题" },
            { label: "填写收件人" },
          ],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields.map((field) => ({ label: field.label, kind: field.kind, options: field.options.length }))).toEqual([
      { label: "recipient", kind: "email", options: 0 },
      { label: "subject", kind: "text", options: 0 },
    ])
  })

  it("keeps only concrete email choices for an email field", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "收件人",
          question: "收件人邮箱地址是什么？",
          options: [
            { label: "我自己", description: "使用当前 Gmail 地址" },
            { label: "zhangli@oomol.com", description: "最近联系人" },
          ],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields).toHaveLength(1)
    expect(fields[0].label).toBe("recipient")
    expect(fields[0].kind).toBe("email")
    expect(fields[0].options).toEqual([
      { label: "zhangli@oomol.com", description: "最近联系人", value: "zhangli@oomol.com" },
    ])
  })

  it("keeps concrete subject suggestions for a text field", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "邮件主题",
          question: "草稿的主题是什么？",
          options: [
            { label: "测试连接", description: "主题使用「测试连接」" },
            { label: "输入其他主题", description: "我来手动输入主题内容" },
          ],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields).toHaveLength(1)
    expect(fields[0].label).toBe("subject")
    expect(fields[0].kind).toBe("text")
    expect(fields[0].options).toEqual([
      { label: "测试连接", description: "主题使用「测试连接」", value: "测试连接" },
      { label: "输入其他主题", description: "我来手动输入主题内容", manual: true, value: "" },
    ])
  })

  it("uses a direct input when an email field only has a manual option", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "收件人",
          question: "收件人邮箱地址是什么？",
          options: [{ label: "输入其他邮箱", description: "我来手动输入收件人邮箱地址" }],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields).toHaveLength(1)
    expect(fields[0].label).toBe("recipient")
    expect(fields[0].kind).toBe("email")
    expect(fields[0].options).toEqual([])
  })

  it("uses short headers for separate structured question steps", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "目标受众",
          question: "这个 skill 的目标受众是谁？是给 AI agent 使用，还是给人类开发者参考？",
          options: [],
        },
        {
          header: "消费场景",
          question: "这个 skill 需要覆盖哪些消费场景？",
          options: [],
        },
      ],
    }

    const fields = deriveQuestionFields(request)

    expect(fields.map((field) => ({ label: field.label, prompt: field.prompt }))).toEqual([
      {
        label: "目标受众",
        prompt: "这个 skill 的目标受众是谁？是给 AI agent 使用，还是给人类开发者参考？",
      },
      { label: "消费场景", prompt: "这个 skill 需要覆盖哪些消费场景？" },
    ])
  })

  it("falls back when a legacy question is too long for a step label", () => {
    const field = deriveQuestionFields({
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "Skill 需求",
          question:
            "1. 这个 skill 的目标受众是谁？是给 AI agent 使用，还是给人类开发者参考？ 2. 这个 skill 需要覆盖哪些消费场景？",
          options: [],
        },
      ],
    })[0]

    expect(questionStepLabel(field.label, "问题 1")).toBe("问题 1")
  })

  it("renders plan_exit confirm questions as direct options, not email fields", () => {
    const request: ChatQuestionRequest = {
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "Build Agent",
          question: "The plan is ready. Switch to Build mode to start implementing?",
          options: [
            { label: "Yes", description: "Switch to Build mode and start implementing" },
            { label: "No", description: "Keep investigating in Plan mode" },
          ],
        },
      ],
    }

    const fields = deriveQuestionFields(request)
    const field = fields[0]

    expect(fields).toHaveLength(1)
    expect(field.kind).toBe("text")
    expect(field.label).toContain("Switch to Build mode")
    expect(field.options.map((option) => option.label)).toEqual(["Yes", "No"])

    // 用户点 Yes 后，答案必须能串成 "Yes"，供 ChatComposer 切回 build 模式。
    const drafts = initialFieldDrafts(fields)
    drafts[0] = { selected: ["Yes"], value: "Yes" }
    expect(answersFromFieldDrafts(request, fields, drafts)[0]).toEqual(["Yes"])
  })

  it("does not treat plain 'to' wording as an email field", () => {
    const field = deriveQuestionFields({
      id: "q1",
      sessionId: "s1",
      questions: [
        {
          header: "Build Agent",
          question: "Ready to switch to Build mode and start implementing?",
          options: [{ label: "Yes" }, { label: "No" }],
        },
      ],
    })[0]

    expect(field.kind).toBe("text")
    expect(field.options.map((option) => option.label)).toEqual(["Yes", "No"])
  })

  it("treats only unchanged first-step drafts as pristine", () => {
    const initialDrafts = [{ selected: [], value: "" }]

    expect(
      isQuestionDraftSnapshotPristine({ activeFieldIndex: 0, drafts: [{ selected: [], value: "" }] }, initialDrafts),
    ).toBe(true)
    expect(
      isQuestionDraftSnapshotPristine({ activeFieldIndex: 1, drafts: [{ selected: [], value: "" }] }, initialDrafts),
    ).toBe(false)
    expect(
      isQuestionDraftSnapshotPristine({ activeFieldIndex: 0, drafts: [{ selected: [], value: " " }] }, initialDrafts),
    ).toBe(false)
    expect(
      isQuestionDraftSnapshotPristine({ activeFieldIndex: 0, drafts: [{ selected: ["A"], value: "" }] }, initialDrafts),
    ).toBe(false)
    expect(
      isQuestionDraftSnapshotPristine({ activeFieldIndex: 0, drafts: [{ selected: [], value: "" }] }, [
        { selected: [], value: "default" },
      ]),
    ).toBe(false)
  })
})

it("supports multiple selection and submits every selected value", () => {
  const request: ChatQuestionRequest = {
    id: "q-multi",
    sessionId: "s1",
    questions: [
      {
        question: "选择你需要的功能",
        header: "功能",
        multiple: true,
        options: [{ label: "文档" }, { label: "表格" }, { label: "演示" }],
      },
    ],
  }
  const fields = deriveQuestionFields(request)
  const field = fields[0]

  expect(field.multiple).toBe(true)
  const drafts = [{ selected: ["文档", "演示"], value: "" }]
  expect(answersFromFieldDrafts(request, fields, drafts)[0]).toEqual(["文档", "演示"])
  // 单选一个时仍返回单值
  expect(answersFromFieldDrafts(request, fields, [{ selected: ["表格"], value: "" }])[0]).toEqual(["表格"])
})

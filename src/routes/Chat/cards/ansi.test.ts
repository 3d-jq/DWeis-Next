import { expect, test } from "vitest"
import { parseAnsi } from "./ansi.ts"

test("parseAnsi splits plain text into one line per row", () => {
  expect(parseAnsi("line1\nline2")).toEqual([
    [{ text: "line1", fg: "fg", bold: false }],
    [{ text: "line2", fg: "fg", bold: false }],
  ])
})

test("parseAnsi ignores carriage returns and strips trailing empty lines", () => {
  expect(parseAnsi("a\r\nb\n\n")).toEqual([
    [{ text: "a", fg: "fg", bold: false }],
    [{ text: "b", fg: "fg", bold: false }],
  ])
})

test("parseAnsi applies SGR color codes", () => {
  const parsed = parseAnsi("\x1b[32mgreen\x1b[0m plain")
  expect(parsed[0]).toEqual([
    { text: "green", fg: "green", bold: false },
    { text: " plain", fg: "fg", bold: false },
  ])
})

test("parseAnsi applies bold and resets on 0", () => {
  const parsed = parseAnsi("\x1b[1mbold\x1b[0mrest")
  expect(parsed[0]).toEqual([
    { text: "bold", fg: "fg", bold: true },
    { text: "rest", fg: "fg", bold: false },
  ])
})

test("parseAnsi skips private-mode sequences like ?25h", () => {
  const parsed = parseAnsi("\x1b[?25h visible")
  expect(parsed[0]?.map((span) => span.text).join("")).toBe(" visible")
})

test("parseAnsi handles combined codes like 1;31", () => {
  const parsed = parseAnsi("\x1b[1;31merror\x1b[0m")
  expect(parsed[0]).toEqual([{ text: "error", fg: "red", bold: true }])
})

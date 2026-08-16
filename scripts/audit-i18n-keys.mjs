import { readFileSync } from "node:fs"

function keysOf(file) {
  const src = readFileSync(file, "utf8")
  const re = /"((?:[a-zA-Z0-9][a-zA-Z0-9._-]*))":\s/g
  const out = new Set()
  let m
  while ((m = re.exec(src))) out.add(m[1])
  return out
}

const zh = keysOf("src/i18n/app-messages.zh.ts")
const en = keysOf("src/i18n/app-messages.en.ts")
console.log("zh:", zh.size, "en:", en.size)
const onlyZh = [...zh].filter((k) => !en.has(k))
const onlyEn = [...en].filter((k) => !zh.has(k))
console.log("--- only in zh ---")
onlyZh.forEach((k) => console.log(k))
console.log("--- only in en ---")
onlyEn.forEach((k) => console.log(k))

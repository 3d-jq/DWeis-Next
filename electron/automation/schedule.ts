/** 自然语言触发规则解析（本地确定性解析，不依赖 AI）。 */

export type AutomationSchedule =
  | { kind: "daily"; time: string }
  | { kind: "weekly"; weekdays: number[]; time: string }
  | { kind: "monthly"; day: number; time: string }
  | { kind: "hourly"; minute: number }
  | { kind: "interval"; minutes: number }

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
const WEEKDAY_ALIASES: Record<string, number> = {
  周一: 0,
  周二: 1,
  周三: 2,
  周四: 3,
  周五: 4,
  周六: 5,
  周日: 6,
  星期一: 0,
  星期二: 1,
  星期三: 2,
  星期四: 3,
  星期五: 4,
  星期六: 5,
  星期日: 6,
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
}

const CHINESE_NUMERALS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function parseChineseNumber(text: string, max = 23): number | null {
  const normalized = text.trim()
  if (/^\d+$/.test(normalized)) {
    const value = Number.parseInt(normalized, 10)
    return value > 0 && value <= max ? value : null
  }
  if (normalized === "十") return 10
  if (normalized.startsWith("十") && CHINESE_NUMERALS[normalized[1]]) {
    return 10 + (CHINESE_NUMERALS[normalized[1]] ?? 0)
  }
  if (normalized.endsWith("十") && CHINESE_NUMERALS[normalized[0]]) {
    return (CHINESE_NUMERALS[normalized[0]] ?? 0) * 10
  }
  if (normalized.length === 1 && CHINESE_NUMERALS[normalized]) {
    return CHINESE_NUMERALS[normalized]
  }
  return null
}

/** 解析时间部分："9点" / "9:30" / "09:00" / "上午10点" / "下午3点半"。返回 "HH:mm" 或 null。 */
function parseTimeOfDay(text: string): string | null {
  const trimmed = text.trim()
  const match = /(\d{1,2})[:：](\d{1,2})/.exec(trimmed)
  if (match) {
    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    }
    return null
  }
  // 中文：上午/下午/晚上 + 数字 + 点（+ 半/一刻/数字分）
  const periodMatch =
    /(上午|早上|早晨|下午|晚上|中午|凌晨)?\s*([零一二两三四五六七八九十\d]+)\s*点(?:\s*(半|一刻|(\d{1,2})分?))?/.exec(
      trimmed,
    )
  if (periodMatch) {
    const hourRaw = parseChineseNumber(periodMatch[2])
    if (hourRaw === null) return null
    let hour = hourRaw
    const period = periodMatch[1]
    if ((period === "下午" || period === "晚上") && hour < 12) hour += 12
    if ((period === "上午" || period === "早上" || period === "早晨" || period === "凌晨") && hour === 12) hour = 0
    let minute = 0
    if (periodMatch[3] === "半") minute = 30
    else if (periodMatch[3] === "一刻") minute = 15
    else if (periodMatch[4]) minute = Number.parseInt(periodMatch[4], 10)
    if (hour < 0 || hour > 23 || minute > 59) return null
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  }
  return null
}

/**
 * 解析自然语言触发规则：
 * - "每天早上9点" / "每天 09:00" → daily
 * - "每周一上午10点" / "每周一、三 10:00" → weekly
 * - "工作日9点" / "周一至周五 9:00" → weekly [0..4]
 * - "每30分钟" / "每隔2小时" / "每5分钟" → interval
 * 解析失败返回 null。
 */
export function parseAutomationSchedule(text: string): AutomationSchedule | null {
  const trimmed = text.trim().replace(/\s+/g, "")
  if (!trimmed) return null

  // 间隔：每/每隔 N 分钟/小时
  const intervalMatch = /^(?:每|每隔)([零一二两三四五六七八九十\d]+)(分钟|小时|分钟吧)?$/.exec(trimmed)
  if (intervalMatch) {
    const value = parseChineseNumber(intervalMatch[1], 24 * 60)
    if (value === null || value <= 0) return null
    const unit = intervalMatch[2]
    const minutes = unit === "小时" ? value * 60 : value
    if (minutes < 1 || minutes > 24 * 60) return null
    return { kind: "interval", minutes }
  }

  // 工作日（周一至周五）
  const weekdayMatch = /^工作日(.+)$/.exec(trimmed)
  if (weekdayMatch) {
    const time = parseTimeOfDay(weekdayMatch[1])
    return time ? { kind: "weekly", weekdays: [0, 1, 2, 3, 4], time } : null
  }

  // 每周 X（或 X、Y、Z）："每" 后直接是 "周一" / "星期一" 等
  const weeklyMatch = /^每([周星期][一二三四五六日天](?:、[周星期][一二三四五六日天])*)(.+)$/.exec(trimmed)
  if (weeklyMatch) {
    const dayPart = weeklyMatch[1]
    const weekdays: number[] = []
    for (const token of dayPart.match(/[周星期][一二三四五六日天]/g) ?? []) {
      const index = WEEKDAY_ALIASES[token]
      if (index !== undefined && !weekdays.includes(index)) weekdays.push(index)
    }
    if (weekdays.length === 0) return null
    const time = parseTimeOfDay(weeklyMatch[2])
    return time ? { kind: "weekly", weekdays, time } : null
  }

  // 每周一至周五 / 周一~周五
  const weeklyRangeMatch = /^每([周星期][一二三四五六日天])至([周星期][一二三四五六日天])(.+)$/.exec(trimmed)
  if (weeklyRangeMatch) {
    const start = WEEKDAY_ALIASES[weeklyRangeMatch[1]]
    const end = WEEKDAY_ALIASES[weeklyRangeMatch[2]]
    if (start === undefined || end === undefined || end < start) return null
    const weekdays = Array.from({ length: end - start + 1 }, (_, index) => start + index)
    const time = parseTimeOfDay(weeklyRangeMatch[3])
    return time ? { kind: "weekly", weekdays, time } : null
  }

  // 每天
  const dailyMatch = /^每天(.+)$/.exec(trimmed)
  if (dailyMatch) {
    const time = parseTimeOfDay(dailyMatch[1])
    return time ? { kind: "daily", time } : null
  }

  return null
}

/** 计算 schedule 在 from（含）之后的下一次触发时刻。 */
export function nextRunAt(schedule: AutomationSchedule, from: Date = new Date()): Date {
  return nextRunAtFromCron(scheduleToCron(schedule), from) ?? new Date(from.getTime() + 60_000)
}

// ── 调度层：标准 5 段 cron（分 时 日 月 星期）──

/** 把结构化调度规则转成标准 cron 表达式（interval 用步进表达式对齐零点）。 */
export function scheduleToCron(schedule: AutomationSchedule): string {
  if (schedule.kind === "interval") {
    return `*/${schedule.minutes} * * * *`
  }
  if (schedule.kind === "hourly") {
    return `${schedule.minute} * * * *`
  }
  const [hour, minute] = schedule.time.split(":").map(Number)
  if (schedule.kind === "daily") {
    return `${minute} ${hour} * * *`
  }
  if (schedule.kind === "monthly") {
    return `${minute} ${hour} ${schedule.day} * *`
  }
  // weekdays 约定 0=周一…6=周日；cron 的星期 0=周日。换算：cronDow = (weekday + 1) % 7。
  const cronDow = [...new Set(schedule.weekdays.map((day) => (day + 1) % 7))].sort((a, b) => a - b)
  return `${minute} ${hour} * * ${cronDow.join(",")}`
}

/** 解析单个 cron 字段（支持通配符、数字、区间、列表、步进）；非法返回 null。 */
export function parseCronField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>()
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let value = min; value <= max; value += 1) values.add(value)
    } else if (/^\*\/(\d+)$/.test(part)) {
      const step = Number.parseInt(part.slice(2), 10)
      if (step <= 0) return null
      for (let value = min; value <= max; value += step) values.add(value)
    } else if (/^\d+-\d+$/.test(part)) {
      const [start, end] = part.split("-").map(Number)
      if (start < min || end > max || start > end) return null
      for (let value = start; value <= end; value += 1) values.add(value)
    } else if (/^\d+$/.test(part)) {
      const value = Number.parseInt(part, 10)
      if (value < min || value > max) return null
      values.add(value)
    } else {
      return null
    }
  }
  return values.size > 0 ? [...values] : null
}

/**
 * 计算 5 段 cron 表达式在 from（不含）之后的下一次触发时刻；非法表达式返回 null。
 * 日与星期同时限定时按 OR 语义（Vixie cron 惯例）；星期 7 视同 0（周日）。
 * 字段按调用方选择的坐标系解读：本地帧 = 本机时区，UTC 帧 = 虚拟时区（时区换算用）。
 */
export function nextRunAtFromCron(cron: string, from: Date = new Date()): Date | null {
  return nextRunAtFromCronInFrame(cron, from, false)
}

/** 同 nextRunAtFromCron，但按 UTC 字段解读（供时区换算把目标时区字段编码进 UTC 后使用）。 */
export function nextRunAtFromCronUtc(cron: string, from: Date = new Date()): Date | null {
  return nextRunAtFromCronInFrame(cron, from, true)
}

function nextRunAtFromCronInFrame(cron: string, from: Date, utc: boolean): Date | null {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) {
    return null
  }
  const minutes = parseCronField(fields[0], 0, 59)
  const hours = parseCronField(fields[1], 0, 23)
  const days = parseCronField(fields[2], 1, 31)
  const months = parseCronField(fields[3], 1, 12)
  const rawWeekdays = parseCronField(fields[4], 0, 7)
  if (!minutes || !hours || !days || !months || !rawWeekdays) {
    return null
  }
  const weekdays = new Set(rawWeekdays.map((day) => day % 7))
  const minuteSet = new Set(minutes)
  const hourSet = new Set(hours)
  const daySet = new Set(days)
  const monthSet = new Set(months)
  const dayLimited = fields[2] !== "*"
  const weekdayLimited = fields[4] !== "*"

  const year = utc ? from.getUTCFullYear() : from.getFullYear()
  const month = utc ? from.getUTCMonth() : from.getMonth()
  const date = utc ? from.getUTCDate() : from.getDate()
  const startMinuteOfDay =
    ((utc ? from.getUTCHours() : from.getHours()) * 60 + (utc ? from.getUTCMinutes() : from.getMinutes())) % (24 * 60)
  // 最多扫 400 天（含跨年）；命中当天后在当天内找第一个匹配 时:分。
  for (let offset = 0; offset <= 400; offset += 1) {
    const day = utc ? new Date(Date.UTC(year, month, date + offset)) : new Date(year, month, date + offset)
    const frameYear = utc ? day.getUTCFullYear() : day.getFullYear()
    const frameMonth = utc ? day.getUTCMonth() : day.getMonth()
    const frameDate = utc ? day.getUTCDate() : day.getDate()
    const frameDay = utc ? day.getUTCDay() : day.getDay()
    if (!monthSet.has(frameMonth + 1)) {
      continue
    }
    const dayHits =
      dayLimited && weekdayLimited
        ? daySet.has(frameDate) || weekdays.has(frameDay)
        : dayLimited
          ? daySet.has(frameDate)
          : weekdayLimited
            ? weekdays.has(frameDay)
            : true
    if (!dayHits) {
      continue
    }
    const fromMinute = offset === 0 ? startMinuteOfDay + 1 : 0
    for (let minuteOfDay = fromMinute; minuteOfDay < 24 * 60; minuteOfDay += 1) {
      if (hourSet.has(Math.floor(minuteOfDay / 60)) && minuteSet.has(minuteOfDay % 60)) {
        return utc
          ? new Date(Date.UTC(frameYear, frameMonth, frameDate, Math.floor(minuteOfDay / 60), minuteOfDay % 60))
          : new Date(frameYear, frameMonth, frameDate, Math.floor(minuteOfDay / 60), minuteOfDay % 60)
      }
    }
  }
  return null
}

/** 校验未知值（如 AI 解析输出）是否为合法 cron 表达式；非法返回 null。 */
export function normalizeCron(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const fields = value.trim().split(/\s+/)
  if (fields.length !== 5) {
    return null
  }
  const checks = [
    parseCronField(fields[0], 0, 59),
    parseCronField(fields[1], 0, 23),
    parseCronField(fields[2], 1, 31),
    parseCronField(fields[3], 1, 12),
    parseCronField(fields[4], 0, 7),
  ]
  return checks.every(Boolean) ? fields.join(" ") : null
}

const timezoneFormatterCache = new Map<string, Intl.DateTimeFormat>()

/** 返回 date 在指定 IANA 时区相对 UTC 的毫秒偏移（带 DST，缓存格式化器）。 */
export function timezoneOffsetMs(date: Date, timezone: string): number {
  let formatter = timezoneFormatterCache.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    timezoneFormatterCache.set(timezone, formatter)
  }
  const parts = formatter.format(date).match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/)
  if (!parts) {
    return 0
  }
  const [, month, day, year, hour, minute, second] = parts.map(Number)
  const zoned = Date.UTC(year, month - 1, day, hour, minute, second)
  return zoned - date.getTime()
}

/**
 * 计算 cron 表达式在任务时区下的下一次触发时刻（绝对时间）。
 * 做法：把 from 的字段按目标时区呈现为假想 UTC，在假想坐标系里算 cron，
 * 再把结果按该时刻的时区偏移换算回绝对时间。
 */
export function nextRunAtInTimezone(cron: string, from: Date = new Date(), timezone: string = defaultTimezone()): Date {
  const offset = timezoneOffsetMs(from, timezone)
  const virtualFrom = new Date(from.getTime() + offset)
  const virtualNext = nextRunAtFromCronUtc(cron, virtualFrom)
  if (!virtualNext) {
    return new Date(from.getTime() + 60_000)
  }
  const nextOffset = timezoneOffsetMs(new Date(virtualNext.getTime() - offset), timezone)
  return new Date(virtualNext.getTime() - nextOffset)
}

/** 本机 IANA 时区（任务默认值）。 */
export function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
}

/**
 * 从 cron 推导展示用结构化规则（有损近似，仅用于 UI 描述；调度始终以 cron 为准）：
 * - "M H * * *" → daily
 * - "M H * * dow" → weekly（星期换算回 0=周一）
 * - "M H D * *" → monthly（取第一个匹配日期）
 * - "M * * * *" → hourly
 * - 分钟字段为步进且其余通配 → interval
 * - 其余 → daily（取第一个匹配 时:分）
 */
export function cronToSchedule(cron: string): AutomationSchedule {
  const fields = cron.trim().split(/\s+/)
  const [minuteField, hourField, dayField, , weekdayField] = fields
  if (fields.length !== 5 || !dayField || !weekdayField) {
    return { kind: "daily", time: "09:00" }
  }
  const intervalMinutes = /^\*\/(\d+)$/.exec(minuteField ?? "")?.[1]
  if (intervalMinutes && hourField === "*" && dayField === "*" && weekdayField === "*") {
    const minutes = Number.parseInt(intervalMinutes, 10)
    if (minutes >= 1 && minutes <= 24 * 60) {
      return { kind: "interval", minutes }
    }
  }
  if (dayField === "*" && weekdayField === "*" && hourField === "*" && /^\d+$/.test(minuteField ?? "")) {
    return { kind: "hourly", minute: Number.parseInt(minuteField ?? "0", 10) }
  }
  if (dayField === "*" && weekdayField === "*") {
    const time = firstTime(hourField, minuteField)
    return { kind: "daily", time }
  }
  if (dayField === "*") {
    const weekdays = (parseCronField(weekdayField, 0, 7) ?? [])
      .map((day) => (day + 6) % 7)
      .filter((day) => day >= 0 && day <= 6)
      .sort((a, b) => a - b)
    if (weekdays.length > 0) {
      return { kind: "weekly", weekdays, time: firstTime(hourField, minuteField) }
    }
  }
  if (weekdayField === "*") {
    const day = parseCronField(dayField, 1, 31)?.[0]
    if (day) {
      return { kind: "monthly", day, time: firstTime(hourField, minuteField) }
    }
  }
  return { kind: "daily", time: firstTime(hourField, minuteField) }
}

function firstTime(hourField: string | undefined, minuteField: string | undefined): string {
  const hour = parseCronField(hourField ?? "*", 0, 23)?.[0] ?? 9
  const minute = parseCronField(minuteField ?? "*", 0, 59)?.[0] ?? 0
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** 调度规则的人类可读描述（列表展示用）。 */
export function describeAutomationSchedule(schedule: AutomationSchedule): string {
  if (schedule.kind === "interval") {
    const minutes = schedule.minutes
    return minutes % 60 === 0 ? `每${minutes / 60}小时` : `每${minutes}分钟`
  }
  if (schedule.kind === "daily") {
    return `每天 ${schedule.time}`
  }
  if (schedule.kind === "monthly") {
    return `每月 ${schedule.day} 日 ${schedule.time}`
  }
  if (schedule.kind === "hourly") {
    return `每小时 ${String(schedule.minute).padStart(2, "0")} 分`
  }
  const days = schedule.weekdays.map((day) => WEEKDAY_NAMES[day]).join("、")
  return `${days} ${schedule.time}`
}

/** 校验未知结构（如 AI 解析输出的 JSON）是否为合法调度规则；非法返回 null。 */
export function normalizeAutomationSchedule(value: unknown): AutomationSchedule | null {
  if (typeof value !== "object" || value === null) {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.kind === "daily" && typeof record.time === "string") {
    const time = normalizeTime(record.time)
    return time ? { kind: "daily", time } : null
  }
  if (record.kind === "weekly" && typeof record.time === "string" && Array.isArray(record.weekdays)) {
    const time = normalizeTime(record.time)
    const weekdays = [...new Set(record.weekdays)]
      .filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b)
    if (time && weekdays.length > 0) {
      return { kind: "weekly", weekdays, time }
    }
    return null
  }
  if (record.kind === "monthly" && typeof record.time === "string" && typeof record.day === "number") {
    const time = normalizeTime(record.time)
    const day = Math.round(record.day)
    if (time && Number.isInteger(day) && day >= 1 && day <= 31) {
      return { kind: "monthly", day, time }
    }
    return null
  }
  if (record.kind === "hourly" && typeof record.minute === "number") {
    const minute = Math.round(record.minute)
    if (Number.isInteger(minute) && minute >= 0 && minute <= 59) {
      return { kind: "hourly", minute }
    }
    return null
  }
  if (record.kind === "interval" && typeof record.minutes === "number") {
    const minutes = Math.round(record.minutes)
    if (minutes >= 1 && minutes <= 24 * 60) {
      return { kind: "interval", minutes }
    }
    return null
  }
  return null
}

function normalizeTime(time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) {
    return null
  }
  const hour = Number.parseInt(match[1], 10)
  const minute = Number.parseInt(match[2], 10)
  if (hour > 23 || minute > 59) {
    return null
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

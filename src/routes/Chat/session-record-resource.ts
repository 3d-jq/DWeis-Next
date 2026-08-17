import * as React from "react"

interface SessionRecordState<T> {
  key: string | null
  records: T[]
}

interface SessionRecordResourceOptions<T> {
  key: string | null
  load: () => Promise<T[]>
  onError: (error: unknown) => void
  subscribe: (refresh: () => void) => () => void
  /** 同一作用域（如会话）内 key 变化时保留旧数据渲染，避免「发送新消息 → 上方产物/输出架闪没再出现」的抖动；
   *  作用域变化（切会话）时立即隔离旧数据。 */
  staleScopeKey?: string | null
}

/** 是否应继续渲染旧记录：同 key（最新）或同作用域（同会话）内 key 变化都保留，等待新数据替换。 */
export function keepStaleRecords(
  key: string | null,
  stateKey: string | null,
  staleScopeKey?: string | null,
): boolean {
  if (stateKey === key) {
    return true
  }
  return Boolean(
    staleScopeKey && key?.startsWith(`${staleScopeKey}\0`) && stateKey?.startsWith(`${staleScopeKey}\0`),
  )
}

/**
 * 会话记录资源：key 变化时重新加载。
 * 默认加载期间返回空（隔离旧数据）；传 staleScopeKey 后，同作用域内 key 变化（如同会话追加消息）
 * 会继续渲染上一次成功结果，直到新数据到达——避免消息列表顶部已渲染的产物/输出区短暂消失导致布局抖动。
 */
export function useSessionRecordResource<T>({
  key,
  load,
  onError,
  subscribe,
  staleScopeKey,
}: SessionRecordResourceOptions<T>): T[] {
  const [state, setState] = React.useState<SessionRecordState<T>>({ key: null, records: [] })
  const [refreshRevision, setRefreshRevision] = React.useState(0)

  React.useEffect(() => {
    if (!key) {
      return
    }
    return subscribe(() => setRefreshRevision((revision) => revision + 1))
  }, [key, subscribe])

  React.useEffect(() => {
    let cancelled = false
    if (!key) {
      setState((current) => (current.key === null ? current : { key: null, records: [] }))
      return
    }
    void load()
      .then((records) => {
        if (!cancelled) {
          setState({ key, records })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        onError(error)
        setState((current) => (current.key === key ? current : { key, records: [] }))
      })
    return () => {
      cancelled = true
    }
  }, [key, load, onError, refreshRevision])

  return keepStaleRecords(key, state.key, staleScopeKey) ? state.records : []
}

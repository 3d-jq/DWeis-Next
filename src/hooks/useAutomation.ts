import type { AutomationTask, AutomationTaskInput } from "../../electron/automation/common.ts"

import * as React from "react"
import { useAutomationService } from "../components/AppContext.ts"
import { reportRendererHandledError } from "../lib/renderer-diagnostics.ts"

export function useAutomation(): {
  tasks: AutomationTask[]
  loading: boolean
  /** 结构化创建：表单字段（名称/调度规则/指令）直接落库。 */
  createTask: (input: AutomationTaskInput) => Promise<void>
  updateTask: (id: string, input: AutomationTaskInput) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  /** 立即手动运行一次（正在运行中时服务端会忽略）。 */
  runTaskNow: (id: string) => Promise<void>
} {
  const service = useAutomationService()
  const [tasks, setTasks] = React.useState<AutomationTask[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    void service
      .invoke("listTasks")
      .then(
        (next) => {
          if (active) setTasks(next)
        },
        (error: unknown) => reportRendererHandledError("automation", "load automation tasks failed", error),
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsubscribe = service.serverEvents.on("automationChanged", (next) => {
      if (active) setTasks(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  const createTask = React.useCallback(
    async (input: AutomationTaskInput) => {
      const next = await service.invoke("createTask", input)
      setTasks(next)
    },
    [service],
  )

  const updateTask = React.useCallback(
    async (id: string, input: AutomationTaskInput) => {
      const next = await service.invoke("updateTask", id, input)
      setTasks(next)
    },
    [service],
  )

  const deleteTask = React.useCallback(
    async (id: string) => {
      const next = await service.invoke("deleteTask", id)
      setTasks(next)
    },
    [service],
  )

  const runTaskNow = React.useCallback(
    async (id: string) => {
      const next = await service.invoke("runTaskNow", id)
      setTasks(next)
    },
    [service],
  )

  return { createTask, deleteTask, loading, runTaskNow, tasks, updateTask }
}

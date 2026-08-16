import type { SkillInventory } from "../../electron/skills/common.ts"

import * as React from "react"
import { ResourceStore } from "@/lib/resource-store"

export interface AppDataResources {
  skillInventory: ResourceStore<SkillInventory>
}

export const AppDataContext = React.createContext<AppDataResources | null>(null)

export function useAppDataResources(): AppDataResources {
  const resources = React.useContext(AppDataContext)

  if (!resources) {
    throw new Error("useAppDataResources must be used within AppDataProvider")
  }

  return resources
}

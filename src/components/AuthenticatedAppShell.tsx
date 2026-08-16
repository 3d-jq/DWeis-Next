import * as React from "react"
import { AppShell } from "@/components/app-shell/AppShell"
import { AppDataProvider } from "@/components/AppDataProvider"
import { initialSetupRequired, legacyOperatingMode, operatingModeGateLoading } from "@/components/operating-profile"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppSettings } from "@/hooks/useAppSettings"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { useModelCatalog } from "@/routes/Chat/useModelCatalog"
import { InitialSetupRoute } from "@/routes/Login/InitialSetupRoute"

export function AuthenticatedAppShell() {
  return (
    <AppDataProvider>
      <TooltipProvider>
        <OperatingModeGate />
        <Toaster />
      </TooltipProvider>
    </AppDataProvider>
  )
}

function OperatingModeGate() {
  const settings = useAppSettings()
  const models = useModelCatalog()
  const [completing, setCompleting] = React.useState(false)
  const migrationStarted = React.useRef(false)
  const operatingMode = settings.settings.operatingMode
  const hasCustomModel = Boolean(models.catalog?.customModels.length)

  React.useEffect(() => {
    if (settings.loading || !models.catalog || operatingMode || migrationStarted.current) {
      return
    }

    const legacyMode = legacyOperatingMode({ hasCustomModel })
    if (!legacyMode) return

    migrationStarted.current = true
    void settings.setOperatingMode(legacyMode).catch((error: unknown) => {
      migrationStarted.current = false
      reportRendererHandledError("settings", "operating mode migration failed", error)
    })
  }, [hasCustomModel, models.catalog, operatingMode, settings])

  const completeSelfManaged = React.useCallback(async () => {
    setCompleting(true)
    try {
      await settings.setOperatingMode("self-managed")
    } finally {
      setCompleting(false)
    }
  }, [settings])

  if (
    operatingModeGateLoading({
      modelCatalogAvailable: Boolean(models.catalog),
      modelCatalogFailed: Boolean(models.catalogError),
      settingsLoading: settings.loading,
    })
  ) {
    return <div className="h-full bg-background" />
  }

  if (initialSetupRequired(operatingMode)) {
    return <InitialSetupRoute completing={completing} models={models} onCompleteSelfManaged={completeSelfManaged} />
  }

  return <AppShell />
}

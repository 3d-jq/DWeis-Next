import type { UseAuth } from "@/hooks/useAuth"

import * as React from "react"
import { AppShell } from "@/components/app-shell/AppShell"
import { AppDataProvider } from "@/components/AppDataProvider"
import {
  initialSetupRequired,
  legacyOperatingMode,
  operatingModeAfterSignOut,
  operatingModeGateLoading,
} from "@/components/operating-profile"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppSettings } from "@/hooks/useAppSettings"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { useModelCatalog } from "@/routes/Chat/useModelCatalog"
import { InitialSetupRoute } from "@/routes/Login/InitialSetupRoute"

export function AuthenticatedAppShell({ auth }: { auth: UseAuth }) {
  return (
    <AppDataProvider>
      <TooltipProvider>
        <OperatingModeGate auth={auth} />
        <Toaster />
      </TooltipProvider>
    </AppDataProvider>
  )
}

function OperatingModeGate({ auth }: { auth: UseAuth }) {
  const settings = useAppSettings()
  const models = useModelCatalog()
  const [completing, setCompleting] = React.useState(false)
  const migrationStarted = React.useRef(false)
  const signedOutProfileResetStarted = React.useRef(false)
  const authenticated = auth.state?.status === "authenticated"
  const operatingMode = settings.settings.operatingMode
  const hasCustomModel = Boolean(models.catalog?.customModels.length)

  React.useEffect(() => {
    if (settings.loading || !models.catalog || operatingMode || migrationStarted.current) {
      return
    }

    const legacyMode = legacyOperatingMode({ authenticated, hasCustomModel })
    if (!legacyMode) return

    migrationStarted.current = true
    void settings.setOperatingMode(legacyMode).catch((error: unknown) => {
      migrationStarted.current = false
      reportRendererHandledError("settings", "operating mode migration failed", error)
    })
  }, [authenticated, hasCustomModel, models.catalog, operatingMode, settings])

  React.useEffect(() => {
    const signedOutMode = operatingModeAfterSignOut(operatingMode)
    if (settings.loading || authenticated || signedOutMode === null || signedOutMode === operatingMode) {
      signedOutProfileResetStarted.current = false
      return
    }
    if (signedOutProfileResetStarted.current) return

    signedOutProfileResetStarted.current = true
    void settings.setOperatingMode(signedOutMode).catch((error: unknown) => {
      signedOutProfileResetStarted.current = false
      reportRendererHandledError("settings", "signed-out operating profile reset failed", error)
    })
  }, [authenticated, operatingMode, settings])

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
      authenticated,
      linkRuntimeLoading: false,
      modelCatalogAvailable: Boolean(models.catalog),
      modelCatalogFailed: Boolean(models.catalogError),
      operatingMode,
      settingsLoading: settings.loading,
    })
  ) {
    return <div className="h-full bg-background" />
  }

  if (initialSetupRequired(authenticated, operatingMode)) {
    return (
      <InitialSetupRoute
        completing={completing}
        models={models}
        onCompleteSelfManaged={completeSelfManaged}
      />
    )
  }

  return <AppShell auth={auth} />
}

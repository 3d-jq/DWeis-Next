import type { UserFacingError } from "@/lib/user-facing-error"
import type { UseModelCatalog } from "@/routes/Chat/useModelCatalog"

import { ArrowRight, BrainCircuit, Check } from "lucide-react"
import * as React from "react"
import { Loader } from "@/components/ai-elements/loader"
import { branding } from "../../../electron/branding.ts"
import { ErrorNotice } from "@/components/ErrorNotice"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/i18n"
import { resolveUserFacingError } from "@/lib/user-facing-error"
import { cn } from "@/lib/utils"
import { AddCustomModelDialog } from "@/routes/Chat/AddCustomModelDialog"

// DWeis Next runs in local self-managed mode only. The initial-setup screen
// therefore never offers a cloud (DWeis/OOMOL) login — it goes straight to the
// local model configuration flow.
export function InitialSetupRoute({
  completing,
  models,
  onCompleteSelfManaged,
}: {
  completing: boolean
  models: UseModelCatalog
  onCompleteSelfManaged: () => Promise<void>
}) {
  return (
    <div className="relative flex h-full flex-col bg-background text-foreground">
      <header className="absolute inset-x-0 top-0 z-10 h-[var(--app-titlebar-height)] [-webkit-app-region:drag]" />
      <main className="oo-login-main min-h-0 flex-1">
        <SelfManagedSetup
          completing={completing}
          models={models}
          onComplete={onCompleteSelfManaged}
          onSkip={onCompleteSelfManaged}
        />
      </main>
    </div>
  )
}

function SelfManagedSetup({
  completing,
  models,
  onComplete,
  onSkip,
}: {
  completing: boolean
  models: UseModelCatalog
  onComplete: () => Promise<void>
  onSkip: () => Promise<void>
}) {
  const t = useT()
  const [actionError, setActionError] = React.useState<UserFacingError | null>(null)
  const hasModel = Boolean(models.catalog?.customModels.length)

  const runActivation = (operation: () => Promise<void>) => {
    setActionError(null)
    void operation().catch((cause: unknown) => {
      setActionError(resolveUserFacingError(cause, { area: "settings", preserveMessage: true }))
    })
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[64rem] flex-col overflow-y-auto px-5 py-8 sm:px-8 lg:px-12">
      <div className="max-w-[44rem]">
        <div className="flex items-center">
          <span className="text-2xl font-semibold tracking-tight">{branding.appName}</span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold md:text-[1.75rem]">{t("setup.selfManagedSetupTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("setup.selfManagedSetupDescription")}</p>
      </div>

      <div className="mt-7 grid gap-4">
        <SetupStep
          complete={hasModel}
          icon={<BrainCircuit className="size-4" />}
          title={t("setup.modelStepTitle")}
          description={
            hasModel
              ? t("setup.modelConfigured", {
                  model:
                    models.catalog?.customModels[0]?.displayName ?? models.catalog?.customModels[0]?.modelName ?? "",
                })
              : t("setup.modelStepDescription")
          }
        >
          <Button variant="outline" size="sm" onClick={() => models.openDialog()}>
            {hasModel ? t("setup.addAnotherModel") : t("setup.configureModel")}
          </Button>
        </SetupStep>
      </div>

      {models.catalogError ? <ErrorNotice error={models.catalogError} compact className="mt-3" /> : null}
      {actionError ? <ErrorNotice error={actionError} compact className="mt-3" /> : null}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t pt-5">
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={completing}
            onClick={() => runActivation(onSkip)}
          >
            {t("setup.skip")}
            <ArrowRight className="size-3.5" />
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{t("setup.skipDescription")}</p>
        </div>
        <Button
          size="lg"
          disabled={!hasModel || completing}
          onClick={() => runActivation(onComplete)}
        >
          {completing ? <Loader /> : <ArrowRight />}
          {t("setup.completeSelfManaged")}
        </Button>
      </div>

      <AddCustomModelDialog
        connectorsEnabled={false}
        open={models.dialogOpen}
        providers={models.catalog?.providers ?? []}
        error={models.dialogError}
        onClose={models.closeDialog}
        onSave={models.saveModel}
      />
    </div>
  )
}

function SetupStep({
  children,
  complete,
  description,
  icon,
  title,
}: {
  children: React.ReactNode
  complete: boolean
  description: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <section className={cn("rounded-xl border bg-card/80 p-4", complete && "border-success/35")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg bg-muted",
              complete && "bg-success/10 text-success",
            )}
          >
            {complete ? <Check className="size-4" /> : icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="shrink-0 sm:self-center">{children}</div>
      </div>
    </section>
  )
}

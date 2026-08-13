import { HardDriveIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { SettingsItem } from "./settings-section.tsx"
import { Button } from "@/components/ui/button"
import {
  ConfirmDialog,
  ConfirmDialogAction,
  ConfirmDialogCancel,
  ConfirmDialogContent,
  ConfirmDialogDescription,
  ConfirmDialogFooter,
  ConfirmDialogHeader,
  ConfirmDialogTitle,
} from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n/i18n"
import { resolveUserFacingError, userFacingErrorDescription } from "@/lib/user-facing-error"

export function StorageSettings({
  currentDirectory,
  defaultDirectory,
  loading,
  onChange,
}: {
  currentDirectory: string | null
  defaultDirectory: string
  loading: boolean
  onChange: (dir: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [pendingTarget, setPendingTarget] = React.useState<string | null>(null)
  const [migrating, setMigrating] = React.useState(false)
  const [migratedTo, setMigratedTo] = React.useState<string | null>(null)

  const requestChange = React.useCallback(async () => {
    const selected = await globalThis.dweisnext?.selectDataDirectory?.()
    if (!selected) {
      return
    }
    setMigratedTo(null)
    setPendingTarget(selected)
  }, [])

  const requestReset = React.useCallback(() => {
    setMigratedTo(null)
    setPendingTarget(defaultDirectory)
  }, [defaultDirectory])

  const confirmMigration = React.useCallback(async () => {
    if (!pendingTarget) {
      return
    }
    setMigrating(true)
    try {
      await onChange(pendingTarget)
      setMigratedTo(pendingTarget)
      setPendingTarget(null)
      toast.success(t("settings.dataDirectoryMigrated"))
    } catch (cause) {
      toast.error(
        userFacingErrorDescription(resolveUserFacingError(cause, { area: "settings" }), t) ??
          t("settings.dataDirectoryMigrateFailed"),
      )
      console.error("[dweis] migrate data directory failed", cause)
    } finally {
      setMigrating(false)
    }
  }, [onChange, pendingTarget, t])

  const relaunch = React.useCallback(() => {
    void globalThis.dweisnext?.relaunchApp?.()
  }, [])

  return (
    <>
      <SettingsItem
        title={t("settings.dataDirectory")}
        description={t("settings.dataDirectoryDescription")}
        icon={HardDriveIcon}
      >
        <div className="grid min-w-0 gap-2">
          <Input readOnly value={currentDirectory ?? ""} className="min-w-[18rem] font-mono text-xs" />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || migrating}
              onClick={() => void requestChange()}
            >
              {t("settings.dataDirectoryChange")}
            </Button>
            {currentDirectory && currentDirectory !== defaultDirectory ? (
              <Button type="button" variant="ghost" size="sm" disabled={loading || migrating} onClick={requestReset}>
                {t("settings.dataDirectoryReset")}
              </Button>
            ) : null}
            {migratedTo ? (
              <Button type="button" variant="outline" size="sm" onClick={relaunch}>
                {t("settings.dataDirectoryRelaunch")}
              </Button>
            ) : null}
          </div>
        </div>
      </SettingsItem>

      <ConfirmDialog
        open={Boolean(pendingTarget)}
        onOpenChange={(open) => {
          if (!migrating && !open) {
            setPendingTarget(null)
          }
        }}
      >
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>{t("settings.dataDirectoryConfirmTitle")}</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              {t("settings.dataDirectoryConfirmDescription", {
                current: currentDirectory ?? "",
                target: pendingTarget ?? "",
              })}
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <ConfirmDialogCancel disabled={migrating}>{t("settings.dataDirectoryCancel")}</ConfirmDialogCancel>
            <ConfirmDialogAction disabled={migrating} onClick={() => void confirmMigration()}>
              {migrating ? t("settings.dataDirectoryMigrating") : t("settings.dataDirectoryConfirmAction")}
            </ConfirmDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>
    </>
  )
}

import * as React from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/i18n/i18n"

export function KnowledgeBetaToggle({
  enabled,
  loading,
  onChange,
}: {
  enabled: boolean
  loading: boolean
  onChange: (enabled: boolean) => Promise<void>
}) {
  const { t } = useI18n()
  const [saving, setSaving] = React.useState(false)
  const disabled = loading || saving

  return (
    <Switch
      checked={enabled}
      disabled={disabled}
      aria-label={t("settings.knowledgeBeta")}
      onCheckedChange={(next) => {
        setSaving(true)
        void onChange(next)
          .catch((error: unknown) => {
            toast.error(t("settings.knowledgeBetaUpdateFailed"))
            console.error("[dweis] update knowledge beta setting failed", error)
          })
          .finally(() => setSaving(false))
      }}
    />
  )
}

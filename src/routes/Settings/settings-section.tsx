import type { LucideIcon } from "lucide-react"

import * as React from "react"
import { SectionHeading } from "@/components/SectionHeading"
import { cn } from "@/lib/utils"

export function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <SectionHeading>{title}</SectionHeading>
      <div className="overflow-hidden rounded-xl border border-[var(--oo-divider)] bg-background shadow-sm">
        {children}
      </div>
    </section>
  )
}

export function SettingsItem({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  title: string
}) {
  return (
    <section
      className={cn(
        "grid min-h-14 items-center gap-x-4 gap-y-2 border-b border-[var(--oo-divider)] last:border-b-0",
        Icon
          ? "grid-cols-[auto_minmax(0,1fr)_auto] px-4 py-3 max-[760px]:grid-cols-[auto_minmax(0,1fr)]"
          : "grid-cols-[minmax(0,1fr)_auto] px-4 py-3 max-[760px]:grid-cols-1",
      )}
    >
      {Icon ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h3 className="oo-text-label truncate text-foreground">{title}</h3>
        {description ? <div className="oo-text-caption mt-0.5 max-w-[44rem]">{description}</div> : null}
      </div>
      <div
        className={cn(
          "min-w-0 justify-self-end max-[760px]:w-full max-[760px]:justify-self-stretch",
          Icon && "max-[760px]:col-span-2",
        )}
      >
        {children}
      </div>
    </section>
  )
}

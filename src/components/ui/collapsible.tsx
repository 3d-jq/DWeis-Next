import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "@/lib/utils"

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />
}

// 统一展开/收起动效（高度 + 淡入淡出 250ms）：任务卡、工具明细、Billing 面板共用。
// radix CollapsibleContent 在 open/closed 时提供 data-state 与 --radix-collapsible-content-height。
function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden data-[state=closed]:animate-[oo-collapsible-up_250ms_cubic-bezier(0.4,0,0.2,1)] data-[state=open]:animate-[oo-collapsible-down_250ms_cubic-bezier(0.4,0,0.2,1)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }

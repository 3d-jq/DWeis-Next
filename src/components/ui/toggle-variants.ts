import { cva } from "class-variance-authority"

const toggleVariants = cva(
  "oo-text-control inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
        // iOS 分段控件：灰轨道 + 白色选中 pill。使用时需 spacing>0（spacing=0 的连体圆角规则会覆盖 rounded-full）。
        segmented:
          "data-[state=off]:text-muted-foreground data-[state=on]:!bg-background data-[state=on]:!text-foreground data-[state=on]:shadow-sm",
      },
      size: {
        default: "h-[var(--oo-control-height)] min-w-[var(--oo-control-height)] px-2",
        sm: "h-[var(--oo-control-height-compact)] min-w-[var(--oo-control-height-compact)] px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--oo-control-height-comfortable)] min-w-[var(--oo-control-height-comfortable)] px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export { toggleVariants }

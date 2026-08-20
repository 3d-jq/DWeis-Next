import { cva } from "class-variance-authority"

export const buttonVariants = cva(
  "oo-text-control inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-[0.42] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-95",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        text: "text-muted-foreground hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Apple 风格：默认/大按钮胶囊（rounded-full），小按钮收紧圆角、图标按钮方形
        default: "h-[var(--oo-control-height)] rounded-full px-3 has-[>svg]:px-2.5",
        sm: "h-[var(--oo-control-height-compact)] gap-1.5 rounded-md px-2.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--oo-control-height-comfortable)] rounded-full px-4 has-[>svg]:px-3",
        icon: "size-[var(--oo-icon-button-size)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

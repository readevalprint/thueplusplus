import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[2px] font-mono text-[13px] lowercase transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-signal text-primary-foreground hover:bg-signal-hover",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border border-isoline bg-transparent text-ash hover:text-bone",
        secondary:
          "bg-raised text-bone hover:bg-isoline",
        ghost:
          "text-ash hover:bg-raised hover:text-bone",
        link: "text-signal underline-offset-4 hover:underline",
      },
      size: {
        "default": "h-[34px] px-3 has-[>svg]:px-2.5",
        "sm": "h-8 gap-1.5 px-2.5 has-[>svg]:px-2",
        "lg": "h-11 px-4 has-[>svg]:px-3",
        "icon": "size-[34px]",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>

import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border-0 bg-transparent px-3 py-1 text-base shadow-none ring-1 ring-inset ring-border/70 transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:ring-border/40",
        "focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-0",
        "aria-invalid:ring-destructive/55 aria-invalid:ring-2 dark:aria-invalid:ring-destructive/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }

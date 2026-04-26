import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-16 w-full rounded-md border-0 bg-transparent px-3 py-2 text-base leading-relaxed shadow-none ring-1 ring-inset ring-border/70 transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/55 md:text-sm dark:ring-border/40 dark:aria-invalid:ring-destructive/50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "destructive" | "muted" | "info";

const tones: Record<Tone, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-inf-red text-white",
        secondary: "border-transparent bg-inf-blue text-white",
        success: "border-green-500/30 bg-green-500/20 text-green-300",
        warning: "border-yellow-500/30 bg-yellow-500/20 text-yellow-300",
        muted: "border-gray-500/30 bg-gray-500/20 text-gray-300",
        outline: "border-white/20 text-white/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

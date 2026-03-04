import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-inf-red text-white shadow-lg hover:bg-red-700 active:scale-95",
        secondary:
          "bg-inf-blue text-white shadow-lg hover:bg-blue-800 active:scale-95",
        success:
          "bg-inf-green text-white shadow-lg hover:bg-green-700 active:scale-95",
        destructive:
          "bg-inf-red text-white shadow-lg hover:bg-red-700 active:scale-95",
        outline:
          "border border-white/20 bg-transparent text-white/70 hover:bg-white/5 hover:text-white",
        ghost:
          "bg-transparent text-white/70 hover:bg-white/10 hover:text-white",
        link: "text-inf-blue underline-offset-4 hover:underline hover:text-blue-300",
      },
      size: {
        default: "h-11 px-6 py-3",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

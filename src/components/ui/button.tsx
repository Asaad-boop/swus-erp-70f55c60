import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-medium cursor-pointer transition-colors duration-[var(--motion-fast)] ease-out focus-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-none hover:bg-[var(--primary-hover)]",
        destructive: "bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90",
        danger: "bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-none hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-none hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        subtle: "bg-[var(--primary-subtle)] text-primary hover:bg-[var(--primary-subtle)] hover:brightness-105",
        link: "text-primary underline-offset-4 hover:underline",
      },

      size: {
        default: "h-[var(--control-h-md)] px-4 py-2",
        sm: "h-[var(--control-h-sm)] rounded-md px-3 text-xs",
        lg: "h-[var(--control-h-lg)] rounded-md px-8",
        icon: "h-[var(--control-h-md)] w-[var(--control-h-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                outline: "text-foreground",
                // Task status badges
                draft: "border-transparent bg-slate-100 text-slate-600",
                queued: "border-transparent bg-blue-100 text-blue-700",
                running: "border-transparent bg-yellow-100 text-yellow-700",
                paused: "border-transparent bg-orange-100 text-orange-700",
                blocked: "border-transparent bg-red-100 text-red-700",
                needs_approval: "border-transparent bg-purple-100 text-purple-700",
                failed: "border-transparent bg-red-100 text-red-700",
                canceled: "border-transparent bg-slate-100 text-slate-500",
                done: "border-transparent bg-green-100 text-green-700",
                // Priority badges
                low: "border-transparent bg-slate-100 text-slate-600",
                normal: "border-transparent bg-blue-100 text-blue-600",
                high: "border-transparent bg-orange-100 text-orange-600",
                urgent: "border-transparent bg-red-100 text-red-600",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };

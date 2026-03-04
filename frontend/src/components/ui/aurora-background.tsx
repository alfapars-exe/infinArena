"use client";
import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
    children: ReactNode;
    showRadialGradient?: boolean;
}

export const AuroraBackground = ({
    className,
    children,
    showRadialGradient = true,
    ...props
}: AuroraBackgroundProps) => {
    return (
        <div
            className={cn(
                "relative flex flex-col min-h-screen items-center justify-center bg-inf-black text-slate-950 transition-bg",
                className
            )}
            {...props}
        >
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className={cn(
                        `
          [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]
          [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]
          [--aurora:repeating-linear-gradient(100deg,#BA2031_10%,#863B96_20%,#0C4D99_30%,#3EBEB4_40%,#FBB615_50%,#BA2031_60%,#863B96_70%,#0C4D99_80%,#3EBEB4_90%)]
          [background-image:var(--dark-gradient),var(--aurora)]
          [background-size:300%,_200%]
          [background-position:50%_50%,50%_50%]
          filter blur-[10px] invert-0
          after:content-[""] after:absolute after:inset-0 after:[background-image:var(--dark-gradient),var(--aurora)]
          after:[background-size:200%,_100%]
          after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference
          pointer-events-none
          absolute -inset-[10px] opacity-40 will-change-transform`,
                        showRadialGradient &&
                        `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]`
                    )}
                ></div>
            </div>
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                {children}
            </div>
        </div>
    );
};

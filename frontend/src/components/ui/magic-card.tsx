"use client";

import { cn } from "@/lib/utils";
import React, { useCallback, useEffect, useRef } from "react";

export interface MagicCardProps extends React.HTMLAttributes<HTMLDivElement> {
    gradientSize?: number;
    gradientColor?: string;
    gradientOpacity?: number;
}

export function MagicCard({
    children,
    className,
    gradientSize = 250,
    gradientColor = "rgba(186, 32, 49, 0.15)", // inf-red subtle glow
    gradientOpacity = 1,
    ...props
}: MagicCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (cardRef.current) {
                const { left, top } = cardRef.current.getBoundingClientRect();
                cardRef.current.style.setProperty("--mouse-x", `${e.clientX - left}px`);
                cardRef.current.style.setProperty("--mouse-y", `${e.clientY - top}px`);
            }
        },
        []
    );

    useEffect(() => {
        const card = cardRef.current;
        if (card) {
            card.addEventListener("mousemove", handleMouseMove);
            return () => card.removeEventListener("mousemove", handleMouseMove);
        }
    }, [handleMouseMove]);

    return (
        <div
            ref={cardRef}
            className={cn(
                "group relative flex w-full h-full overflow-hidden rounded-xl bg-white/5 border border-white/10 backdrop-blur-md transition-all hover:border-white/20",
                className
            )}
            {...props}
        >
            <div className="relative z-10 w-full h-full flex flex-col">{children}</div>
            <div
                className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                    background: `radial-gradient(${gradientSize}px circle at var(--mouse-x) var(--mouse-y), ${gradientColor}, transparent 100%)`,
                    opacity: gradientOpacity,
                }}
            />
        </div>
    );
}

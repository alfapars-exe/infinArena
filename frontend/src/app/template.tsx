"use client";

import { motion, AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pathname}
                initial={{ opacity: 0, filter: "blur(5px)", y: 10 }}
                animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                exit={{ opacity: 0, filter: "blur(5px)", y: -10 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full h-full min-h-screen"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}

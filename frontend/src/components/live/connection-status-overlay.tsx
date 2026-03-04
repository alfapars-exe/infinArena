"use client";

import { AnimatePresence, motion } from "framer-motion";

interface ConnectionStatusOverlayProps {
  isVisible: boolean;
  title: string;
  subtitle: string;
  hint: string;
}

export function ConnectionStatusOverlay({
  isVisible,
  title,
  subtitle,
  hint,
}: ConnectionStatusOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="text-center px-4"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="w-16 h-16 border-4 border-inf-yellow border-t-transparent rounded-full mx-auto mb-6"
            />
            <h1 className="text-3xl md:text-4xl font-black text-white mb-3">{title}</h1>
            <p className="text-white/70 text-lg mb-2">{subtitle}</p>
            <p className="text-white/50 text-sm mt-4">{hint}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


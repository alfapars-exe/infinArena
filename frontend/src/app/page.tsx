"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "@/lib/i18n";
import { apiFetch } from "@/lib/services/api-client";
import { AuroraBackground } from "@/components/ui/aurora-background";

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const maybeError = (err as { error?: unknown }).error;
    if (typeof maybeError === "string" && maybeError.trim()) return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const nestedMessage = (maybeError as { message?: unknown }).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
    }
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

export default function HomePage() {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setError(t("home.pinMustBe6"));
      return;
    }

    setChecking(true);
    setError("");

    try {
      const res = await apiFetch(`/api/sessions/${pin}`);
      if (res.ok) {
        router.push(`/play/${pin}`);
      } else {
        const data = await res.json();
        setError(getErrorMessage(data, t("home.invalidPin")));
      }
    } catch {
      setError(t("home.connectionError"));
    }
    setChecking(false);
  };

  const handlePinInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    setError("");

    // Auto-submit if 6 digits are reached
    if (digits.length === 6) {
      // Small delay to let the UI update first
      setTimeout(() => {
        const formEvent = new Event("submit", { cancelable: true, bubbles: true });
        document.getElementById("join-form")?.dispatchEvent(formEvent);
      }, 100);
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <AuroraBackground>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 text-center w-full px-4"
        style={{ maxWidth: "520px" }}
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, filter: "blur(10px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 100, delay: 0.3 }}
          className="mb-10"
        >
          <h1 className="text-6xl md:text-7xl font-black text-white mb-3 tracking-tight drop-shadow-2xl">
            infin<span className="text-inf-yellow drop-shadow-lg">Arena</span>
          </h1>
          <p className="text-white/80 text-lg md:text-xl font-medium tracking-wide">
            {t("home.enterPinToJoin")}
          </p>
        </motion.div>

        {/* Form Container */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 120 }}
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 md:p-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative overflow-hidden group"
        >
          {/* Subtle glow effect behind form */}
          <div className="absolute inset-0 bg-gradient-to-tr from-inf-blue/10 via-inf-purple/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />

          <form id="join-form" onSubmit={handleSubmit} className="relative z-10">
            {/* Hidden native input */}
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => handlePinInput(e.target.value)}
              className="absolute opacity-0 pointer-events-none w-0 h-0"
              maxLength={6}
              disabled={checking}
            />

            {/* Custom OTP Display */}
            <div
              className="flex justify-center gap-2 md:gap-3 mb-6 cursor-text"
              onClick={handleContainerClick}
            >
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const char = pin[index] || "";
                const isActive = pin.length === index || (pin.length === 6 && index === 5);

                return (
                  <motion.div
                    key={index}
                    animate={{
                      scale: isActive && !checking ? 1.05 : 1,
                      y: isActive && !checking ? -4 : 0,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`w-12 h-16 md:w-14 md:h-18 flex items-center justify-center rounded-xl md:rounded-2xl text-3xl md:text-4xl font-black transition-colors duration-200 ${isActive
                        ? "bg-white text-inf-black shadow-[0_0_20px_rgba(255,255,255,0.4)] ring-4 ring-inf-turquoise/50"
                        : char
                          ? "bg-white/90 text-inf-black"
                          : "bg-white/20 text-white/40 border border-white/20"
                      }`}
                  >
                    <AnimatePresence mode="popLayout">
                      {char && (
                        <motion.span
                          key={char + index}
                          initial={{ opacity: 0, scale: 0.5, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.5, y: -10 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        >
                          {char}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <p className="text-red-300 bg-red-500/20 border border-red-500/30 rounded-lg py-2 px-4 text-sm font-semibold">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={pin.length !== 6 || checking}
              whileHover={{ scale: pin.length === 6 && !checking ? 1.03 : 1 }}
              whileTap={{ scale: pin.length === 6 && !checking ? 0.97 : 1 }}
              className={`w-full py-4 rounded-xl text-xl font-bold transition-all duration-300 shadow-xl overflow-hidden relative ${pin.length === 6
                  ? "bg-gradient-to-r from-inf-red to-orange-500 text-white hover:shadow-[0_0_30px_rgba(186,32,49,0.5)]"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
                }`}
            >
              <div className="relative z-10 flex items-center justify-center gap-3">
                {checking ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full inline-block"
                    />
                    <span>{t("home.checking")}</span>
                  </>
                ) : (
                  <span>{t("home.enter")}</span>
                )}
              </div>

              {/* Shine effect on button activation */}
              {pin.length === 6 && !checking && (
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear", delay: 0.5 }}
                  className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/2 -skew-x-12"
                />
              )}
            </motion.button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 text-white/60 text-sm font-medium tracking-wide drop-shadow-md"
        >
          {t("home.askHostPin")}
        </motion.p>
      </motion.div>
    </AuroraBackground>
  );
}

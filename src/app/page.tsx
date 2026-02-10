"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslation } from "@/lib/i18n";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setError(t("home.pinMustBe6"));
      return;
    }

    setChecking(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${pin}`);
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black d-flex flex-column align-items-center justify-content-center p-3 p-md-4">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-10"
            style={{
              width: Math.random() * 200 + 50,
              height: Math.random() * 200 + 50,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: ["#BA2031", "#0C4D99", "#FBB615", "#20AE4C", "#3EBEB4", "#863B96", "#F15C35", "#C5D931"][i % 8],
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, 15, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center w-100"
        style={{ maxWidth: "520px" }}
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="mb-8"
        >
          <h1 className="text-6xl font-black text-white mb-2 tracking-tight">
            infin<span className="text-inf-yellow">Arena</span>
          </h1>
          <p className="text-white/60 text-lg">{t("home.enterPinToJoin")}</p>
        </motion.div>

        {/* PIN Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl p-8 shadow-2xl"
        >
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => handlePinInput(e.target.value)}
              className="w-full text-center text-4xl font-black text-gray-800 py-4 px-6 rounded-xl border-2 border-gray-200 focus:border-inf-red focus:outline-none transition-colors tracking-[0.5em] placeholder-gray-300"
              placeholder="------"
              maxLength={6}
              autoFocus
            />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-inf-red text-sm mt-3 font-medium"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              type="submit"
              disabled={pin.length !== 6 || checking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full mt-4 bg-inf-red hover:bg-red-700 text-white font-bold py-4 rounded-xl text-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {checking ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block"
                  />
                  {t("home.checking")}
                </span>
              ) : (
                t("home.enter")
              )}
            </motion.button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-white/40 text-sm"
        >
          {t("home.askHostPin")}
        </motion.p>
      </motion.div>
    </div>
  );
}



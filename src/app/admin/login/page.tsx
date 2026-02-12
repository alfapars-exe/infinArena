"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslation } from "@/lib/i18n";

export default function AdminLogin() {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(t("login.invalidFull"));
      setLoading(false);
    } else {
      router.push("/infinarenapanel");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black d-flex align-items-center justify-content-center p-3 p-md-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-100"
        style={{ maxWidth: "520px" }}
      >
        <div className="text-center mb-8">
          <div className="d-flex justify-content-center mb-4">
            <div className="bg-white/95 rounded-xl px-3 py-1 shadow-lg">
              <img src="/logo.png" alt="infinArena" className="h-12 w-auto" />
            </div>
          </div>
          <motion.h1
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="text-5xl font-black text-white mb-2"
          >
            infin<span className="text-inf-yellow">Arena</span>
          </motion.h1>
          <p className="text-white/70 text-lg">{t("login.adminPanel")}</p>
        </div>

        <div className="card bg-white/10 backdrop-blur-md rounded-2xl p-4 p-md-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                {t("login.username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="admin"
                required
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                {t("login.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder={t("login.passwordPlaceholder")}
                required
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-inf-red bg-red-100/20 rounded-lg p-3 text-sm"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full btn-primary text-lg disabled:opacity-50"
            >
              {loading ? t("login.loggingIn") : t("login.submit")}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}





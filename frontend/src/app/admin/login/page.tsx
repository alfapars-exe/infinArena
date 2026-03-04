"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslation } from "@/lib/i18n";
import { loginWithPassword } from "@/lib/services/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

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

    const result = await loginWithPassword(username, password);
    if (!result.ok) {
      setError(t("login.invalidFull"));
      setLoading(false);
    } else {
      router.push("/infinarenapanel");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black flex items-center justify-center p-3 md:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
        style={{ maxWidth: "520px" }}
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
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

        <Card className="bg-white/10 backdrop-blur-md rounded-2xl p-4 md:p-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-white/80">
                {t("login.username")}
              </Label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>

            <div>
              <Label className="text-white/80">
                {t("login.password")}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              className="w-full bg-inf-red text-white font-bold py-3 px-6 rounded-lg hover:bg-red-700 transition-all duration-200 active:scale-95 shadow-lg text-lg disabled:opacity-50"
            >
              {loading ? t("login.loggingIn") : t("login.submit")}
            </motion.button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

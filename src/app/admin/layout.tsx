"use client";

import { SessionProvider, signOut, useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n, useTranslation } from "@/lib/i18n";
import { MusicProvider } from "@/lib/music-context";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const buildDate = process.env.NEXT_PUBLIC_COMMIT_DATE;
  const buildVersion = process.env.NEXT_PUBLIC_COMMIT_VERSION || "v.1.0.0";
  const parsedBuildDate = buildDate ? new Date(buildDate) : null;
  const formattedBuildDate =
    parsedBuildDate && !Number.isNaN(parsedBuildDate.getTime())
      ? parsedBuildDate.toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "-";
  
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut({ redirect: false });
    } catch {
    } finally {
      window.location.replace("/infinarenapanel/login");
    }
  };

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/infinarenapanel/login") {
      router.push("/infinarenapanel/login");
    }
  }, [status, router, pathname]);

  if (pathname === "/infinarenapanel/login") {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black flex items-center justify-center">
        <div className="text-center px-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"
          />
          <p className="text-white text-xl font-bold mb-1">{t("common.pleaseWait")}</p>
          <p className="text-white/60 text-sm">{t("common.pageLoading")}</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <MusicProvider>
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        
        <nav className="bg-inf-red/90 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
          <div className="container-fluid app-container px-3 px-md-4">
            <div className="d-flex flex-wrap flex-md-nowrap align-items-center justify-content-between gap-2 py-2 py-md-0 min-h-[64px]">
              <Link href="/infinarenapanel" className="flex items-center gap-3">
                <span className="text-2xl font-black text-white">infinArena</span>
                <span className="bg-white/20 text-white/80 text-xs font-medium px-2 py-1 rounded">
                  ADMIN
                </span>
              </Link>

              <div className="d-flex align-items-center flex-wrap gap-2 gap-md-4 justify-content-end">
                <Link
                  href="/infinarenapanel"
                  className="text-white/70 hover:text-white transition-colors text-sm font-medium"
                >
                  {t("nav.dashboard")}
                </Link>
                <span className="text-white/60 text-xs whitespace-nowrap">
                  {t("nav.buildInfo", { date: formattedBuildDate, version: buildVersion })}
                </span>
                <LanguageToggle />
                <span className="text-white/50 text-sm">
                  {session.user?.name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-white/50 hover:text-white transition-colors text-sm bg-transparent border-0 p-0"
                >
                  {t("nav.logout")}
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="container-fluid app-container px-3 px-md-4 py-3 py-md-4 py-lg-5">
          <div className="row">
            <div className="col-12">{children}</div>
          </div>
        </main>
      </div>
    </MusicProvider>
  );
}

function LanguageToggle() {
  const { locale, toggleLocale } = useI18n();
  return (
    <button
      onClick={toggleLocale}
      className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors"
      title="Toggle language"
    >
      {locale === "en" ? "TR" : "EN"}
    </button>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AdminGuard>{children}</AdminGuard>
    </SessionProvider>
  );
}

"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n, useTranslation } from "@/lib/i18n";
import { MusicProvider } from "@/lib/music-context";
import {
  fetchCurrentAdmin,
  logoutAdmin,
  type AuthUser,
} from "@/lib/services/auth-client";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const isAdminPath = pathname.startsWith("/admin");
  const loginPath = isAdminPath ? "/admin/login" : "/infinarenapanel/login";
  const dashboardPath = isAdminPath ? "/admin" : "/infinarenapanel";

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

  useEffect(() => {
    let isCancelled = false;

    const loadAuth = async () => {
      const currentUser = await fetchCurrentAdmin();
      if (isCancelled) return;

      if (currentUser) {
        setUser(currentUser);
        setStatus("authenticated");
        if (pathname === "/infinarenapanel/login" || pathname === "/admin/login") {
          router.replace(dashboardPath);
        }
      } else {
        setUser(null);
        setStatus("unauthenticated");
        if (pathname !== "/infinarenapanel/login" && pathname !== "/admin/login") {
          router.replace(loginPath);
        }
      }
    };

    void loadAuth();

    return () => {
      isCancelled = true;
    };
  }, [dashboardPath, loginPath, pathname, router]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutAdmin();
    } finally {
      window.location.replace(loginPath);
    }
  };

  if (pathname === "/infinarenapanel/login" || pathname === "/admin/login") {
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

  if (!user) return null;

  return (
    <MusicProvider>
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <nav className="bg-inf-red/90 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
          <div className="container-fluid app-container px-3 px-md-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 min-h-[64px]">
              <div className="flex items-center gap-3 min-w-0">
                <Link
                  href="/infinarenapanel"
                  className="text-2xl font-black text-white tracking-tight leading-none shrink-0"
                >
                  infin<span className="text-inf-yellow">Arena</span>
                </Link>
                <span className="bg-white/20 text-white/90 text-xs font-medium px-2 py-1 rounded shrink-0 hidden sm:inline-flex">
                  ADMIN
                </span>
                <Link
                  href="/infinarenapanel"
                  className="text-white/70 hover:text-white transition-colors text-sm font-medium hidden md:inline"
                >
                  {t("nav.dashboard")}
                </Link>
              </div>

              <Link href="/infinarenapanel" className="justify-self-center">
                <img
                  src="/logo.png"
                  alt="infinArena"
                  className="h-8 md:h-9 w-auto drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
                />
              </Link>

              <div className="flex items-center justify-end gap-2 gap-md-4 min-w-0">
                <span className="text-white/60 text-xs whitespace-nowrap hidden lg:inline">
                  {t("nav.buildInfo", { date: formattedBuildDate, version: buildVersion })}
                </span>
                <LanguageToggle />
                <span className="text-white/50 text-sm">{user.name}</span>
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
  return <AdminGuard>{children}</AdminGuard>;
}

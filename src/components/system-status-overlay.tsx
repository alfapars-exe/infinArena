"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";

const HEALTH_CHECK_INTERVAL_MS = 5000;
const HEALTH_CHECK_TIMEOUT_MS = 4000;
const MAINTENANCE_FAILURE_THRESHOLD = 2;

export function SystemStatusOverlay() {
  const { locale } = useTranslation();
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const failureCountRef = useRef(0);
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    let isUnmounted = false;

    const markHealthy = () => {
      if (isUnmounted) return;
      failureCountRef.current = 0;
      setIsMaintenanceMode(false);
    };

    const markUnhealthy = () => {
      if (isUnmounted) return;
      failureCountRef.current += 1;
      if (failureCountRef.current >= MAINTENANCE_FAILURE_THRESHOLD) {
        setIsMaintenanceMode(true);
      }
    };

    const checkHealth = async () => {
      if (isUnmounted || requestInFlightRef.current) return;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        markUnhealthy();
        return;
      }

      requestInFlightRef.current = true;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT_MS
      );

      try {
        const response = await fetch(`/api/health?ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.ok) {
          markHealthy();
        } else {
          markUnhealthy();
        }
      } catch {
        markUnhealthy();
      } finally {
        window.clearTimeout(timeoutId);
        requestInFlightRef.current = false;
      }
    };

    const onOnline = () => {
      void checkHealth();
    };

    const onOffline = () => {
      markUnhealthy();
    };

    void checkHealth();
    const intervalId = window.setInterval(() => {
      void checkHealth();
    }, HEALTH_CHECK_INTERVAL_MS);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      isUnmounted = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!isMaintenanceMode) return null;

  const title =
    locale === "tr"
      ? "Bakım modu aktifleştirildi."
      : "Maintenance mode activated.";

  const detail =
    locale === "tr"
      ? "Hugging Face Space yeniden başlatılıyor, build alıyor veya başlatılıyor olabilir."
      : "Hugging Face Space may currently be restarting, building, or starting.";

  const waitText = locale === "tr" ? "Lütfen bekleyiniz..." : "Please wait...";

  return (
    <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <div className="w-16 h-16 border-4 border-inf-yellow/30 border-t-inf-yellow rounded-full animate-spin mx-auto mb-6" />
        <h2 className="text-white text-3xl md:text-4xl font-black mb-3">{title}</h2>
        <p className="text-white/75 text-base md:text-lg mb-3">{detail}</p>
        <p className="text-white/60 text-sm md:text-base">{waitText}</p>
      </div>
    </div>
  );
}

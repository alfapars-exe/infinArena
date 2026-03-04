"use client";

import { useTranslation } from "@/lib/i18n";

export default function AdminLoading() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[60dvh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-white/25 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-white text-2xl font-black mb-2">{t("common.pleaseWait")}</h2>
        <p className="text-white/60 text-sm">{t("common.pageLoading")}</p>
      </div>
    </div>
  );
}


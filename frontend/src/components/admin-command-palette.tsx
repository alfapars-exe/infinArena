"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useQuizzes } from "@/lib/hooks/use-quizzes";
import { useTranslation } from "@/lib/i18n";

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const { data: quizzes = [] } = useQuizzes();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("nav.dashboard") + "..."} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading={t("nav.dashboard")}>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/infinarenapanel"))}
          >
            {t("nav.dashboard")}
          </CommandItem>
        </CommandGroup>
        {quizzes.length > 0 && (
          <CommandGroup heading={t("dashboard.myQuizzes")}>
            {quizzes.map((quiz) => (
              <CommandItem
                key={quiz.id}
                onSelect={() =>
                  runCommand(() =>
                    router.push(`/infinarenapanel/quizzes/${quiz.id}`)
                  )
                }
              >
                {quiz.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

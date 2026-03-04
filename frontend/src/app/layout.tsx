import type { Metadata } from "next";
import "./globals.css";
import { SystemStatusOverlay } from "@/components/system-status-overlay";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "infinArena - Interactive Quiz Platform",
  description: "Create and play interactive quizzes in real-time!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
        <SystemStatusOverlay />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(31, 41, 55, 0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
            },
          }}
        />
      </body>
    </html>
  );
}

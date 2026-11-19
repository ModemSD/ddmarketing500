import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DISRUPT × SBER500 — Аналитика и управление портфелем",
  description: "Единая аналитическая платформа: продуктовые метрики, маркетинг и управление стартапами",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}


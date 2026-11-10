import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bot500 — Админка рассылок по стартапам",
  description: "Мини-админка для массовых и индивидуальных рассылок из Google Таблиц в Telegram-чаты стартапов",
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


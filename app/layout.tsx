import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { LocaleProvider } from "@/lib/i18n/context";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Halo Studio",
  description: "Painel de automação de conteúdo para YouTube",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LocaleProvider>
          {children}
          <LocaleToggle />
        </LocaleProvider>
      </body>
    </html>
  );
}

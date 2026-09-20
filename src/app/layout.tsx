import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Template Importer",
  description: "Bring a Spectora template across intact, then edit and copy it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/templates" className="text-base font-semibold tracking-tight text-ink">
              <span className="mr-2 inline-block h-3 w-3 rotate-45 rounded-[2px] bg-brand align-middle" />
              Template Importer
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600">
              <Link href="/templates" className="hover:text-ink">My templates</Link>
              <Link href="/import" className="hover:text-ink">Import from Spectora</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

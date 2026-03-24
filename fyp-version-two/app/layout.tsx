// Import global styles, and setup layout.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

// Set CSS custom properties for the fonts, so they can be used in the app.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Export metadata for the app, which can be used by Next.js for SEO and other purposes.
export const metadata: Metadata = {
  title: "FYP - Nursery Rota Management System",
  description: "This webpage, by Euan Mair, is intended to automate the process of creating a nursery rota.",
};

// RootLayout component that wraps the entire application. It sets up the HTML structure and applies global styles. This is the highest level wrapper for the app, and all pages will be rendered inside this layout.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}
        <header className="p-4 border-b">
          <nav className="flex gap-4">
            <Link href="/">Home</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/login">Login</Link>
          </nav>
        </header>
      </body>
    </html>
  );
}

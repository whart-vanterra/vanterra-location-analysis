import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vanterra Location Intelligence v3.0",
  description: "Market expansion analysis and location recommendations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: 'var(--background)' }}
      >
        <header className="fixed top-0 left-0 right-0 z-30 shadow-sm" style={{ backgroundColor: '#4C9784' }}>
          <div className="max-w-full mx-auto px-6 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold text-white">
              Vanterra Location Intelligence v3.0
            </h1>
            <span className="text-xs text-white/70">Internal Report Tool</span>
          </div>
        </header>
        <main className="pt-16 max-w-full mx-auto px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

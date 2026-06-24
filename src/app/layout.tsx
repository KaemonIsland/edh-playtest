import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Glitched Goblet Playtester",
  description:
    "A Commander/EDH playtesting table: paste a decklist and goldfish it. Card data and images provided by Scryfall. Not affiliated with Wizards of the Coast.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Unified top navigation, mounted once in the root layout so every page shares
 * the same chrome. Hidden on the immersive playtest table (/play). The active
 * section is derived from the pathname, with each section owning a small family
 * of routes (e.g. Decks covers /decks and /d/[id], Playtest covers /import and
 * /play setup).
 */

const NAV: { href: string; label: string; emoji: string; match: (p: string) => boolean }[] = [
  { href: "/collection", label: "Collection", emoji: "📚", match: (p) => p.startsWith("/collection") },
  { href: "/cards", label: "All Cards", emoji: "🃏", match: (p) => p.startsWith("/cards") },
  { href: "/decks", label: "Decks", emoji: "🗂️", match: (p) => p.startsWith("/decks") || p.startsWith("/d/") },
  { href: "/import", label: "Playtest", emoji: "🎮", match: (p) => p.startsWith("/import") || p.startsWith("/play") },
];

export function AppHeader() {
  const pathname = usePathname() || "/";
  // The playtest table is full-screen and immersive — no global chrome there.
  if (pathname.startsWith("/play")) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-800 bg-[#08080a]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4">
        <Link
          href="/"
          className="mr-2 flex shrink-0 items-center gap-2 py-3 text-sm font-bold tracking-tight text-stone-100"
        >
          <span className="text-base">🍷</span>
          <span className="hidden sm:inline">Glitched Goblet</span>
        </Link>

        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-stone-800 text-white"
                    : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"
                }`}
              >
                <span className="text-xs">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          title="Settings"
          className={`shrink-0 rounded-md px-2.5 py-1.5 text-base transition ${
            pathname.startsWith("/settings")
              ? "bg-stone-800 text-white"
              : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"
          }`}
        >
          ⚙️
        </Link>
      </div>
    </header>
  );
}

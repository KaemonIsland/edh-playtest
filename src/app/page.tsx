"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ScryCard } from "@/types";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";

const OPTIONS = [
  {
    href: "/collection",
    emoji: "📚",
    title: "Collection",
    blurb: "Browse, filter, and value everything you own — by set, color, type, and more.",
    accent: "hover:border-sky-600/60",
  },
  {
    href: "/cards",
    emoji: "🃏",
    title: "All Cards",
    blurb: "Browse every set and add the cards you opened or bought to your collection.",
    accent: "hover:border-violet-600/60",
  },
  {
    href: "/decks",
    emoji: "🗂️",
    title: "Decks",
    blurb: "Build, showcase, and track your Commander decks with primers, stats, and game logs.",
    accent: "hover:border-emerald-600/60",
  },
  {
    href: "/import",
    emoji: "🎮",
    title: "Playtest",
    blurb: "Goldfish a deck on a real-feeling table — solo or against rules-based bot opponents.",
    accent: "hover:border-rose-600/60",
  },
];

export default function HomePage() {
  const [showcase, setShowcase] = useState<ScryCard | null>(null);

  // A fresh random legendary commander on each load.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cards/random?q=" + encodeURIComponent("is:commander t:legendary"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { card: ScryCard } | null) => {
        if (!cancelled && d?.card) setShowcase(d.card);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const art =
    showcase?.image_uris?.art_crop ?? showcase?.card_faces?.[0]?.image_uris?.art_crop;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#08080a] text-stone-100">
      {/* Ambient commander art backdrop */}
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 blur-sm"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/80 via-[#08080a]/90 to-[#08080a]" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-10">
        <header className="text-center">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Glitched Goblet <span className="text-emerald-500">Playtester</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-400">
            A Commander workshop: track your collection, build and show off decks, and goldfish
            them on a tactile table.
          </p>
        </header>

        {/* Three options */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPTIONS.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className={`group flex flex-col rounded-2xl border border-stone-800 bg-stone-950/80 p-6 transition ${o.accent} hover:bg-stone-900/80`}
            >
              <span className="text-4xl transition group-hover:scale-110">{o.emoji}</span>
              <span className="mt-3 text-xl font-bold">{o.title}</span>
              <span className="mt-1 text-xs leading-relaxed text-stone-500">{o.blurb}</span>
              <span className="mt-4 text-sm font-semibold text-stone-400 group-hover:text-stone-200">
                Open →
              </span>
            </Link>
          ))}
        </div>

        {/* Random commander showcase */}
        <div className="mt-10 flex flex-1 flex-col items-center justify-center">
          <div className="mb-3 text-[11px] font-bold tracking-wide text-stone-500 uppercase">
            Commander of the moment ✨
          </div>
          {showcase ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Link
                href={`/api/cards/random`}
                onClick={(e) => {
                  e.preventDefault();
                  window.location.reload();
                }}
                className="shrink-0 transition hover:scale-[1.02]"
                title="Refresh for another"
              >
                <CardImage card={showcase} className="w-56 drop-shadow-2xl" />
              </Link>
              <div className="max-w-sm text-center sm:text-left">
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <h2 className="text-lg font-bold">{showcase.name}</h2>
                  <ManaCost cost={showcase.mana_cost} size={16} />
                </div>
                <div className="mt-0.5 text-xs text-stone-500">{showcase.type_line}</div>
                <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-stone-300">
                  {showcase.oracle_text}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
                >
                  🔀 Show another
                </button>
              </div>
            </div>
          ) : (
            <div className="h-72 w-52 animate-pulse rounded-xl bg-stone-900" />
          )}
        </div>

        <footer className="mt-10 text-center text-[10px] text-stone-600">
          Card data and images provided by Scryfall. Not affiliated with Wizards of the Coast.
          Unofficial Fan Content permitted under the WotC Fan Content Policy.
        </footer>
      </div>
    </div>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getRepo, type ShowcaseDeck } from "@/lib/repo";
import { computeDeckStats } from "@/lib/deck/stats";
import { StatsPanel } from "@/components/showcase/StatsPanel";
import { DecklistView } from "@/components/showcase/DecklistView";
import { PrimerEditor } from "@/components/showcase/PrimerEditor";
import { ChangelogTimeline } from "@/components/showcase/ChangelogTimeline";
import { GameLogPanel } from "@/components/showcase/GameLogPanel";
import { CommentsPanel } from "@/components/showcase/CommentsPanel";
import { ShareBar } from "@/components/showcase/ShareBar";

const PIP_STYLE: Record<string, string> = {
  W: "bg-amber-100 text-stone-900",
  U: "bg-sky-500 text-white",
  B: "bg-stone-600 text-white",
  R: "bg-red-500 text-white",
  G: "bg-green-600 text-white",
};

export default function ShowcasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deck, setDeck] = useState<ShowcaseDeck | null | "loading">("loading");

  useEffect(() => {
    void getRepo().getDeck(id).then(setDeck);
  }, [id]);

  if (deck === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#08080a] text-sm text-stone-500">
        Loading deck…
      </div>
    );
  }
  if (!deck) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#08080a] text-stone-300">
        <p className="text-sm">Deck not found.</p>
        <Link href="/decks" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600">
          My decks
        </Link>
      </div>
    );
  }

  const stats = computeDeckStats(deck.deck);
  const summary = `${stats.cardCount} cards · ${stats.landCount} lands · avg CMC ${stats.avgCmc.toFixed(2)}${
    stats.priceUsd !== null ? ` · ~$${stats.priceUsd.toFixed(0)}` : ""
  }`;

  return (
    <div className="min-h-dvh bg-[#08080a] text-stone-200">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-stone-800">
        {deck.commanderArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deck.commanderArt}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_20%] opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/70 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-6">
          <nav className="mb-6 flex gap-4 text-xs text-stone-400">
            <Link href="/" className="hover:text-white">Import</Link>
            <Link href="/decks" className="hover:text-white">My decks</Link>
          </nav>
          <div className="flex items-end gap-3">
            <h1 className="text-3xl font-black tracking-tight text-white drop-shadow">
              {deck.name}
            </h1>
            <div className="mb-1.5 flex gap-1">
              {deck.colorIdentity.map((c) => (
                <span
                  key={c}
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow ${PIP_STYLE[c] ?? "bg-stone-500"}`}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm text-stone-300">
            <span className="font-semibold">{deck.commanderNames.join(" + ")}</span>
            <span className="mx-2 text-stone-600">·</span>
            <span className="capitalize">{deck.format}</span>
            <span className="mx-2 text-stone-600">·</span>
            <span className="text-stone-400">{summary}</span>
          </p>
          {deck.description && <p className="mt-2 max-w-2xl text-sm text-stone-400">{deck.description}</p>}
          <div className="mt-4">
            <ShareBar deck={deck.deck} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <StatsPanel deck={deck.deck} />
        <PrimerEditor deckId={deck.id} />
        <DecklistView deck={deck.deck} />
        <ChangelogTimeline deckId={deck.id} />
        <GameLogPanel deckId={deck.id} />
        <CommentsPanel deckId={deck.id} />
      </main>

      <footer className="border-t border-stone-900 py-4 text-center text-[10px] text-stone-600">
        Card data and images provided by Scryfall. Not affiliated with Wizards of the Coast.
        Unofficial Fan Content permitted under the WotC Fan Content Policy.
      </footer>
    </div>
  );
}

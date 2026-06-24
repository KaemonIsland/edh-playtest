"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Deck } from "@/types";
import { getRepo, type ShowcaseDeck } from "@/lib/repo";
import { computeDeckStats } from "@/lib/deck/stats";
import { Section } from "@/components/showcase/Section";
import { StatsPanel } from "@/components/showcase/StatsPanel";
import { DecklistView } from "@/components/showcase/DecklistView";
import { PrimerEditor } from "@/components/showcase/PrimerEditor";
import { ChangelogTimeline } from "@/components/showcase/ChangelogTimeline";
import { GameLogPanel } from "@/components/showcase/GameLogPanel";
import { CommentsPanel } from "@/components/showcase/CommentsPanel";
import { CollectionCoverage } from "@/components/showcase/CollectionCoverage";
import { ShareBar } from "@/components/showcase/ShareBar";

export default function ShowcasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deck, setDeck] = useState<ShowcaseDeck | null | "loading">("loading");
  const [editingTags, setEditingTags] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    void getRepo().getDeck(id).then(setDeck);
  }, [id]);

  /** Persist deck-level changes (role overrides, bracket, tags). */
  const updateDeck = useCallback(
    async (next: Deck) => {
      await getRepo().saveDeck(next);
      const fresh = await getRepo().getDeck(next.id);
      if (fresh) setDeck(fresh);
    },
    [],
  );

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
  const bracket = deck.deck.bracket ?? null;
  const tags = deck.deck.tags ?? [];
  const summary = `${stats.cardCount} cards · ${stats.landCount} lands · avg CMC ${stats.avgCmc.toFixed(2)}`;

  const setBracket = (value: number | null) => {
    void updateDeck({ ...deck.deck, bracket: value ?? undefined });
  };

  const saveTags = () => {
    const next = tagDraft.split(",").map((t) => t.trim()).filter(Boolean);
    void updateDeck({ ...deck.deck, tags: next });
    setEditingTags(false);
  };

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
          <nav className="mb-6 text-xs text-stone-400">
            <Link href="/decks" className="hover:text-white">← My decks</Link>
          </nav>
          <div className="flex flex-wrap items-end gap-3">
            <h1 className="text-3xl font-black tracking-tight text-white drop-shadow">
              {deck.name}
            </h1>
            <div className="mb-1.5 flex gap-1">
              {deck.colorIdentity.map((c) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={c} src={`/mana/${c}.svg`} alt={c} className="h-5 w-5 drop-shadow" />
              ))}
            </div>
            {/* Bracket: auto-guess until manually set */}
            <button
              onClick={() => {
                const raw = window.prompt(
                  `Commander bracket (1–5). Auto-guess: ${stats.bracketGuess}. Leave empty to use the auto-guess.`,
                  bracket !== null ? String(bracket) : "",
                );
                if (raw === null) return;
                const n = parseInt(raw, 10);
                setBracket(Number.isFinite(n) && n >= 1 && n <= 5 ? n : null);
              }}
              className="mb-1.5 rounded-full border border-amber-700/60 bg-amber-950/50 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 hover:bg-amber-900/50"
              title={
                bracket !== null
                  ? "Bracket set manually — click to change"
                  : "Rough auto-guess from tutors/curve/interaction — click to set manually"
              }
            >
              Bracket {bracket ?? stats.bracketGuess}
              <span className="ml-1 font-normal text-amber-500/70">
                {bracket !== null ? "" : "auto"}
              </span>
            </button>
          </div>
          <p className="mt-1 text-sm text-stone-300">
            <span className="font-semibold">{deck.commanderNames.join(" + ")}</span>
            <span className="mx-2 text-stone-600">·</span>
            <span className="capitalize">{deck.format}</span>
            <span className="mx-2 text-stone-600">·</span>
            <span className="text-stone-400">{summary}</span>
          </p>

          {/* Tags */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-stone-800/90 px-2.5 py-0.5 text-[11px] text-stone-300">
                #{t}
              </span>
            ))}
            {editingTags ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTags()}
                  placeholder="aggro, tokens, pet-deck"
                  className="rounded-md border border-stone-700 bg-stone-900 px-2 py-0.5 text-[11px] outline-none focus:border-emerald-600"
                />
                <button onClick={saveTags} className="text-[11px] font-bold text-emerald-400">✓</button>
                <button onClick={() => setEditingTags(false)} className="text-[11px] text-stone-500">✕</button>
              </span>
            ) : (
              <button
                onClick={() => {
                  setTagDraft(tags.join(", "));
                  setEditingTags(true);
                }}
                className="rounded-full border border-dashed border-stone-700 px-2.5 py-0.5 text-[11px] text-stone-500 hover:text-stone-300"
              >
                {tags.length > 0 ? "✎ tags" : "+ add tags"}
              </button>
            )}
          </div>

          {deck.description && <p className="mt-2 max-w-2xl text-sm text-stone-400">{deck.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/d/${deck.id}/edit`}
              className="rounded-md bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-sky-600"
            >
              ✎ Edit deck
            </Link>
            <ShareBar deck={deck.deck} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <Section id="decklist" title="Decklist">
          <DecklistView deck={deck.deck} />
        </Section>
        <Section id="primer" title="Primer">
          <PrimerEditor deckId={deck.id} />
        </Section>
        <Section id="stats" title="Deck stats">
          <StatsPanel deck={deck.deck} onUpdateDeck={(d) => void updateDeck(d)} />
        </Section>
        <Section id="collection" title="Collection coverage">
          <CollectionCoverage deck={deck.deck} />
        </Section>
        <Section id="games" title="Games">
          <GameLogPanel deckId={deck.id} />
        </Section>
        <Section id="changelog" title="Changelog">
          <ChangelogTimeline deckId={deck.id} />
        </Section>
        <Section id="comments" title="Comments">
          <CommentsPanel deckId={deck.id} />
        </Section>
      </main>

      <footer className="border-t border-stone-900 py-4 text-center text-[10px] text-stone-600">
        Card data and images provided by Scryfall. Not affiliated with Wizards of the Coast.
        Unofficial Fan Content permitted under the WotC Fan Content Policy.
      </footer>
    </div>
  );
}

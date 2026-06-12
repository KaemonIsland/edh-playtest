"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getRepo, type ShowcaseDeckMeta } from "@/lib/repo";

const PIP_STYLE: Record<string, string> = {
  W: "bg-amber-100 text-stone-900",
  U: "bg-sky-500 text-white",
  B: "bg-stone-600 text-white",
  R: "bg-red-500 text-white",
  G: "bg-green-600 text-white",
};

export default function DecksPage() {
  const [decks, setDecks] = useState<ShowcaseDeckMeta[] | null>(null);

  const refresh = useCallback(async () => {
    setDecks(await getRepo().listDecks());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-dvh bg-[#08080a] text-stone-200">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My decks</h1>
            <p className="mt-1 text-sm text-stone-500">
              Saved showcases — primers, stats, changelogs, and game history.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
          >
            + Import a deck
          </Link>
        </div>

        {decks === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : decks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center">
            <p className="text-sm text-stone-500">
              No decks saved yet. Import a deck and hit “Save to My Decks”.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="group relative overflow-hidden rounded-xl border border-stone-800 bg-stone-950 transition hover:border-stone-600"
              >
                <Link href={`/d/${deck.id}`} className="block">
                  <div className="relative h-32 overflow-hidden bg-stone-900">
                    {deck.commanderArt && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={deck.commanderArt}
                        alt=""
                        className="h-full w-full object-cover object-[center_20%] transition group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950 to-transparent" />
                    <div className="absolute bottom-2 left-3 flex gap-1">
                      {deck.colorIdentity.map((c) => (
                        <span
                          key={c}
                          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${PIP_STYLE[c] ?? "bg-stone-500"}`}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3">
                    <h2 className="truncate text-sm font-bold text-stone-100">{deck.name}</h2>
                    <p className="truncate text-[11px] text-stone-500">
                      {deck.commanderNames.join(" + ") || "No commander"}
                    </p>
                    <p className="mt-1 text-[10px] text-stone-600">
                      Updated {new Date(deck.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={async () => {
                    if (window.confirm(`Delete "${deck.name}" and its primer/games/changelog?`)) {
                      await getRepo().deleteDeck(deck.id);
                      await refresh();
                    }
                  }}
                  className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                  title="Delete deck"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[10px] text-stone-600">
          {getRepo().mode === "local"
            ? "Stored locally in this browser (IndexedDB). Add Supabase keys for a shared backend."
            : "Stored in Supabase."}
        </p>
      </div>
    </div>
  );
}

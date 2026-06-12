"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRepo, type ShowcaseDeckMeta } from "@/lib/repo";
import {
  getCardDbStatus,
  syncCardDatabase,
  type CardDbStatus,
  type SyncProgress,
} from "@/lib/cards/carddb";

type DeckMetaWithTags = ShowcaseDeckMeta & { tags?: string[] };

export default function DecksPage() {
  const [decks, setDecks] = useState<DeckMetaWithTags[] | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<CardDbStatus>({ syncedAt: null, count: 0 });
  const [syncing, setSyncing] = useState<SyncProgress | null>(null);

  const refresh = useCallback(async () => {
    const repo = getRepo();
    const metas = await repo.listDecks();
    // Pull tags off the full deck records (kept out of the meta projection).
    const withTags = await Promise.all(
      metas.map(async (m) => {
        const full = await repo.getDeck(m.id);
        return { ...m, tags: full?.deck.tags ?? [] };
      }),
    );
    setDecks(withTags);
  }, []);

  useEffect(() => {
    void refresh();
    setDbStatus(getCardDbStatus());
  }, [refresh]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const d of decks ?? []) for (const t of d.tags ?? []) tags.add(t);
    return [...tags].sort();
  }, [decks]);

  const visible = useMemo(
    () => (decks ?? []).filter((d) => !tagFilter || (d.tags ?? []).includes(tagFilter)),
    [decks, tagFilter],
  );

  const runSync = async () => {
    try {
      const status = await syncCardDatabase(setSyncing);
      setDbStatus(status);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Card database sync failed.");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="min-h-dvh bg-[#08080a] text-stone-200">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-4 flex items-center justify-between">
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

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTagFilter(null)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                tagFilter === null ? "bg-emerald-700 text-white" : "bg-stone-900 text-stone-400 hover:text-stone-200"
              }`}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  tagFilter === t ? "bg-emerald-700 text-white" : "bg-stone-900 text-stone-400 hover:text-stone-200"
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {decks === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center">
            <p className="text-sm text-stone-500">
              {tagFilter
                ? `No decks tagged #${tagFilter}.`
                : "No decks saved yet. Import a deck and hit “Save to My Decks”."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((deck) => (
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
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={c} src={`/mana/${c}.svg`} alt={c} className="h-4 w-4" />
                      ))}
                    </div>
                  </div>
                  <div className="p-3">
                    <h2 className="truncate text-sm font-bold text-stone-100">{deck.name}</h2>
                    <p className="truncate text-[11px] text-stone-500">
                      {deck.commanderNames.join(" + ") || "No commander"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {(deck.tags ?? []).map((t) => (
                        <span key={t} className="rounded-full bg-stone-800 px-1.5 py-0.5 text-[9px] text-stone-400">
                          #{t}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] text-stone-600">
                        {new Date(deck.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
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

        {/* Local card database */}
        <div className="mt-10 rounded-xl border border-stone-800 bg-stone-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-stone-200">Local card database</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {dbStatus.syncedAt
                  ? `${dbStatus.count.toLocaleString()} cards · synced ${new Date(dbStatus.syncedAt).toLocaleDateString()} — card search runs offline.`
                  : "Not synced — card search falls back to the Scryfall API. Sync once (~35MB, Scryfall bulk data, updated daily) for instant offline search in the deck builder."}
              </p>
            </div>
            <button
              onClick={() => void runSync()}
              disabled={!!syncing}
              className="rounded-md bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {syncing
                ? syncing.phase === "store"
                  ? `Storing ${syncing.stored.toLocaleString()}/${syncing.total.toLocaleString()}…`
                  : syncing.phase === "download"
                    ? "Downloading…"
                    : "Preparing…"
                : dbStatus.syncedAt
                  ? "Re-sync"
                  : "Sync card database"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-stone-600">
          {getRepo().mode === "local"
            ? "Stored locally in this browser (IndexedDB). Add Supabase keys for a shared backend."
            : "Stored in Supabase."}{" "}
          Card data and images provided by Scryfall.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScryCard } from "@/types";
import { advancedSearchCards, getCardDbStatus, type SearchFilters } from "@/lib/cards/carddb";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";

const COLORS = ["W", "U", "B", "R", "G", "C"] as const;

/** Full-screen card search with advanced filters (Archidekt-style). */
export function CardSearchModal({
  initialQuery,
  onOpenCard,
  onClose,
}: {
  initialQuery: string;
  /** Clicking a card opens its detail modal (where it can be added). */
  onOpenCard: (card: ScryCard) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialQuery);
  const [advanced, setAdvanced] = useState(false);
  const [type, setType] = useState("");
  const [text, setText] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<"any" | "identity">("any");
  const [mvOp, setMvOp] = useState<"=" | ">=" | "<=">("=");
  const [mv, setMv] = useState("");
  const [results, setResults] = useState<ScryCard[] | null>(null);
  const [searching, setSearching] = useState(false);

  const run = useCallback(async () => {
    setSearching(true);
    try {
      const filters: SearchFilters = {
        name: name.trim() || undefined,
        type: type.trim() || undefined,
        text: text.trim() || undefined,
        colors: colors.length > 0 ? colors : undefined,
        colorMode,
        mv: mv.trim() ? parseFloat(mv) : undefined,
        mvOp,
      };
      setResults(await advancedSearchCards(filters));
    } finally {
      setSearching(false);
    }
  }, [name, type, text, colors, colorMode, mv, mvOp]);

  // Run the initial query immediately.
  useEffect(() => {
    if (initialQuery.trim()) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-5xl rounded-xl border border-stone-700 bg-stone-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder="Card name…"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button
            onClick={() => void run()}
            disabled={searching}
            className="shrink-0 rounded-md bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <button onClick={onClose} className="shrink-0 rounded px-2 py-1 text-stone-500 hover:text-stone-200">
            ✕
          </button>
        </div>

        {/* Advanced options */}
        <button
          onClick={() => setAdvanced(!advanced)}
          className="mt-2 text-xs font-semibold text-stone-400 hover:text-stone-200"
        >
          {advanced ? "▾" : "▸"} Advanced options
        </button>
        {advanced && (
          <div className="mt-2 grid gap-2 rounded-lg border border-stone-800 bg-stone-900/50 p-3 sm:grid-cols-2">
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="Type (e.g. Creature, Elf, Instant)"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
            />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="Oracle text (e.g. draw a card)"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
            />
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                  }
                  className={`rounded-full p-0.5 transition ${
                    colors.includes(c) ? "bg-emerald-700 ring-1 ring-emerald-400" : "opacity-50 hover:opacity-90"
                  }`}
                  title={c}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/mana/${c}.svg`} alt={c} className="h-5 w-5" />
                </button>
              ))}
              <div className="ml-2 flex gap-0.5 rounded-lg bg-stone-900 p-0.5 text-[10px]">
                {(["any", "identity"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setColorMode(m)}
                    className={`rounded-md px-2 py-1 font-semibold capitalize ${
                      colorMode === m ? "bg-stone-700 text-white" : "text-stone-500"
                    }`}
                    title={m === "any" ? "Card is at least one of these colors" : "Color identity fits within these colors"}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">MV</span>
              <div className="flex gap-0.5 rounded-lg bg-stone-900 p-0.5 text-[10px]">
                {(["=", ">=", "<="] as const).map((op) => (
                  <button
                    key={op}
                    onClick={() => setMvOp(op)}
                    className={`rounded-md px-2 py-1 font-mono font-semibold ${
                      mvOp === op ? "bg-stone-700 text-white" : "text-stone-500"
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
              <input
                value={mv}
                onChange={(e) => setMv(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void run()}
                placeholder="Mana value"
                className="w-24 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
              />
            </div>
          </div>
        )}

        {/* Results */}
        <div className="mt-3">
          {results === null ? (
            <p className="py-8 text-center text-xs text-stone-600">
              {getCardDbStatus().syncedAt
                ? "Search the local card database."
                : "Search via Scryfall (sync the card DB on /decks for offline + more results)."}
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-600">No cards match.</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-stone-500">
                {results.length} result{results.length === 1 ? "" : "s"} — click a card for details
                and to add it.
              </p>
              <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {results.map((card) => (
                  <button
                    key={card.oracle_id}
                    onClick={() => onOpenCard(card)}
                    className="group relative text-left"
                    style={{ contentVisibility: "auto", containIntrinsicSize: "180px" }}
                    title={`View ${card.name}`}
                  >
                    <CardImage
                      card={card}
                      className="aspect-[5/7] w-full transition group-hover:ring-2 group-hover:ring-sky-500"
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-[10px] text-stone-400">{card.name}</span>
                      <ManaCost cost={card.mana_cost} size={9} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

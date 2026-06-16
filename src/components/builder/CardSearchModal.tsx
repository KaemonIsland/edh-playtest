"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScryCard } from "@/types";
import { advancedSearchCards, byNewest, getCardDbStatus, type SearchFilters } from "@/lib/cards/carddb";
import { getRepo } from "@/lib/repo";
import {
  emptyFilters,
  filtersActive,
  matchesFilters,
  type CardFilters,
} from "@/components/collection/FilterSidebar";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";

const COLORS = ["W", "U", "B", "R", "G", "C"] as const;
const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
const OPS = ["=", ">=", "<="] as const;

/** Map the shared filter shape (+ keyword/set) to the search engine filters. */
function toSearchFilters(f: CardFilters, keyword: string, set: string): SearchFilters {
  return {
    name: f.name.trim() || undefined,
    type: f.types.join(" ") || undefined,
    text: f.text.trim() || undefined,
    colors: f.colors.length ? f.colors : undefined,
    colorMode: f.colorMode,
    mv: f.mv.trim() ? parseFloat(f.mv) : undefined,
    mvOp: f.mvOp,
    power: f.power.trim() ? parseFloat(f.power) : undefined,
    powerOp: f.powerOp,
    toughness: f.toughness.trim() ? parseFloat(f.toughness) : undefined,
    toughnessOp: f.toughnessOp,
    rarities: f.rarities.length ? f.rarities : undefined,
    keyword: keyword.trim() || undefined,
    set: set.trim() || undefined,
    commander: f.commanderOnly || undefined,
  };
}

/** Full-screen card search with Scryfall-like advanced filters. */
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
  const [filters, setFilters] = useState<CardFilters>(() => ({ ...emptyFilters(), name: initialQuery }));
  const [keyword, setKeyword] = useState("");
  const [set, setSet] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [results, setResults] = useState<ScryCard[] | null>(null);
  const [searching, setSearching] = useState(false);

  const setF = (patch: Partial<CardFilters>) => setFilters((p) => ({ ...p, ...patch }));
  const toggle = (key: "types" | "colors" | "rarities", value: string) =>
    setFilters((p) => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter((x) => x !== value) : [...p[key], value],
    }));

  const run = useCallback(async () => {
    setSearching(true);
    try {
      if (ownedOnly) {
        // Browse the collection itself (works without the card DB synced).
        const collection = await getRepo().listCollection();
        const byOracle = new Map<string, ScryCard>();
        for (const c of collection) if (c.quantity > 0) byOracle.set(c.oracleId, c.card);
        const kw = keyword.trim().toLowerCase();
        const setQ = set.trim().toLowerCase();
        const cards = [...byOracle.values()]
          .filter((c) => matchesFilters(c, filters))
          .filter((c) => !kw || (c.keywords ?? []).some((k) => k.toLowerCase() === kw))
          .filter((c) => !setQ || (c.set ?? "").toLowerCase() === setQ)
          .sort(byNewest);
        setResults(cards);
        return;
      }
      setResults(await advancedSearchCards(toSearchFilters(filters, keyword, set)));
    } finally {
      setSearching(false);
    }
  }, [filters, keyword, set, ownedOnly]);

  // Run the initial query immediately.
  useEffect(() => {
    if (initialQuery.trim()) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run when the owned-only toggle changes (after the first search).
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) void run();
    else setTouched(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedOnly]);

  const NumberRow = ({
    label,
    op,
    value,
    onOp,
    onValue,
  }: {
    label: string;
    op: CardFilters["mvOp"];
    value: string;
    onOp: (op: CardFilters["mvOp"]) => void;
    onValue: (v: string) => void;
  }) => (
    <div className="flex items-center gap-1.5">
      <span className="w-16 text-[10px] font-bold tracking-wide text-stone-500 uppercase">{label}</span>
      <div className="flex gap-0.5 rounded-lg bg-stone-900 p-0.5 text-[10px]">
        {OPS.map((o) => (
          <button
            key={o}
            onClick={() => onOp(o)}
            className={`rounded-md px-2 py-1 font-mono font-semibold ${
              op === o ? "bg-stone-700 text-white" : "text-stone-500"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void run()}
        placeholder="—"
        inputMode="numeric"
        className="w-20 rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
      />
    </div>
  );

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
            value={filters.name}
            onChange={(e) => setF({ name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder="Card name…"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button
            onClick={() => setOwnedOnly((v) => !v)}
            className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition ${
              ownedOnly
                ? "bg-amber-700 text-white"
                : "border border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800"
            }`}
            title="Only show cards you own (from your collection)"
          >
            ★ Owned only
          </button>
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
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setAdvanced(!advanced)}
            className="text-xs font-semibold text-stone-400 hover:text-stone-200"
          >
            {advanced ? "▾" : "▸"} Advanced options
          </button>
          {filtersActive(filters) || keyword || set ? (
            <button
              onClick={() => {
                setFilters(emptyFilters());
                setKeyword("");
                setSet("");
              }}
              className="text-[11px] text-stone-500 hover:text-rose-400"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {advanced && (
          <div className="mt-2 flex flex-col gap-3 rounded-lg border border-stone-800 bg-stone-900/50 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={filters.text}
                onChange={(e) => setF({ text: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void run()}
                placeholder="Oracle text (e.g. draw a card)"
                className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
              />
              <div className="flex gap-2">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void run()}
                  placeholder="Keyword (e.g. flying)"
                  className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
                />
                <input
                  value={set}
                  onChange={(e) => setSet(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void run()}
                  placeholder="Set code"
                  className="w-28 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Types */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Type</span>
              {["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => toggle("types", t)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                      filters.types.includes(t)
                        ? "bg-emerald-700 text-white"
                        : "bg-stone-900 text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>

            {/* Colors + mode */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Color</span>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggle("colors", c)}
                  className={`rounded-full p-0.5 transition ${
                    filters.colors.includes(c) ? "ring-2 ring-emerald-400" : "opacity-50 hover:opacity-90"
                  }`}
                  title={c}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/mana/${c}.svg`} alt={c} className="h-5 w-5" />
                </button>
              ))}
              <div className="ml-1 flex gap-0.5 rounded-lg bg-stone-900 p-0.5 text-[10px]">
                {(["any", "exact", "identity"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setF({ colorMode: m })}
                    className={`rounded-md px-2 py-1 font-semibold capitalize ${
                      filters.colorMode === m ? "bg-stone-700 text-white" : "text-stone-500"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Numeric */}
            <div className="grid gap-2 sm:grid-cols-3">
              <NumberRow label="Mana value" op={filters.mvOp} value={filters.mv} onOp={(mvOp) => setF({ mvOp })} onValue={(mv) => setF({ mv })} />
              <NumberRow label="Power" op={filters.powerOp} value={filters.power} onOp={(powerOp) => setF({ powerOp })} onValue={(power) => setF({ power })} />
              <NumberRow label="Toughness" op={filters.toughnessOp} value={filters.toughness} onOp={(toughnessOp) => setF({ toughnessOp })} onValue={(toughness) => setF({ toughness })} />
            </div>

            {/* Commander + Rarity */}
            <button
              onClick={() => setF({ commanderOnly: !filters.commanderOnly })}
              className={`self-start rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                filters.commanderOnly
                  ? "bg-amber-700 text-white"
                  : "border border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800"
              }`}
            >
              👑 Can be commander
            </button>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Rarity</span>
              {RARITIES.map((r) => (
                <button
                  key={r}
                  onClick={() => toggle("rarities", r)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize transition ${
                    filters.rarities.includes(r)
                      ? "bg-amber-700 text-white"
                      : "bg-stone-900 text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-stone-600">
              Rarity, power, toughness, and keyword filters use the local card database — re-sync it
              on “My decks” to populate those fields. Without a sync, search falls back to Scryfall.
            </p>
          </div>
        )}

        {/* Results */}
        <div className="mt-3">
          {results === null ? (
            <p className="py-8 text-center text-xs text-stone-600">
              {getCardDbStatus().syncedAt
                ? "Search your local card database."
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

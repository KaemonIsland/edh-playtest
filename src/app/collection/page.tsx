"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScryCard } from "@/types";
import { FINISH_LABEL, finishPrice, getRepo, type CollectionCard } from "@/lib/repo";
import { collectionStats, enrichCollectionFromOracle, setCollectionQty } from "@/lib/cards/collection";
import { getCardDbStatus } from "@/lib/cards/carddb";
import { cardComparator, type CardSort } from "@/lib/cards/sort";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";
import { CardSearchModal } from "@/components/builder/CardSearchModal";
import { CardDetailModal } from "@/components/builder/CardDetailModal";
import { ImportCsvModal } from "@/components/collection/ImportCsvModal";
import { SetsBrowser } from "@/components/collection/SetsBrowser";
import {
  FilterSidebar,
  emptyFilters,
  filtersActive,
  matchesFilters,
  type CardFilters,
} from "@/components/collection/FilterSidebar";

type View = { kind: "browse" } | { kind: "all" } | { kind: "set"; code: string; name: string };
const PAGE = 60;

export default function CollectionPage() {
  const [cards, setCards] = useState<CollectionCard[] | null>(null);
  const [view, setView] = useState<View>({ kind: "browse" });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CardFilters>(emptyFilters);
  const [sort, setSort] = useState<CardSort>("color");
  const [showFilters, setShowFilters] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [searchModal, setSearchModal] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<ScryCard | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    const list = await getRepo().listCollection();
    setCards(list);
    // Backfill rarity/keywords/release date on older rows (best-effort).
    const enriched = await enrichCollectionFromOracle(list);
    if (enriched !== list) setCards(enriched);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cards in the current scope (all vs a set), before filters.
  const scopeCards = useMemo(() => {
    const all = (cards ?? []).filter((c) => c.quantity > 0);
    if (view.kind === "set") return all.filter((c) => (c.setCode ?? c.card.set) === view.code);
    return all;
  }, [cards, view]);

  const scopeStats = useMemo(() => collectionStats(scopeCards), [scopeCards]);

  const visible = useMemo(() => {
    const filtered = scopeCards.filter((c) => matchesFilters(c.card, filters));
    // Precompute stack value so the comparator's price lookup is O(1), not O(n).
    const priceByCard = new Map<ScryCard, number>();
    if (sort === "value") {
      for (const c of filtered) priceByCard.set(c.card, (finishPrice(c.card, c.finish) ?? 0) * c.quantity);
    }
    const cmp = cardComparator(sort, (sc) => priceByCard.get(sc) ?? 0);
    return [...filtered].sort((a, b) => cmp(a.card, b.card));
  }, [scopeCards, filters, sort]);

  useEffect(() => {
    setLimit(PAGE);
  }, [view, filters, sort]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((n) => n + PAGE);
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible.length]);
  const shown = visible.slice(0, limit);

  const changeQty = async (c: CollectionCard, qty: number) => {
    setCards((prev) => {
      if (!prev) return prev;
      if (qty <= 0) return prev.filter((x) => x.id !== c.id);
      return prev.map((x) => (x.id === c.id ? { ...x, quantity: qty, updatedAt: Date.now() } : x));
    });
    await setCollectionQty(c.card, c.finish, qty);
  };

  const totalStats = useMemo(
    () => collectionStats((cards ?? []).filter((c) => c.quantity > 0)),
    [cards],
  );

  const inGrid = view.kind !== "browse";

  return (
    <div className="flex min-h-dvh flex-col bg-[#08080a] text-stone-200">
      {/* Header */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <nav className="mb-4 flex gap-4 text-xs text-stone-400">
          <Link href="/import" className="hover:text-white">Import</Link>
          <Link href="/decks" className="hover:text-white">My decks</Link>
          <span className="font-semibold text-stone-200">Collection</span>
        </nav>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            {inGrid && (
              <button
                onClick={() => setView({ kind: "browse" })}
                className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
              >
                ← Sets
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {view.kind === "set" ? view.name : view.kind === "all" ? "All cards" : "My collection"}
              </h1>
              <p className="mt-0.5 text-sm text-stone-500">
                {view.kind === "browse"
                  ? "Browse by set, or open All cards to filter everything."
                  : "Click a card for details, printings, and which decks use it."}
              </p>
            </div>
          </div>
          {/* Context-specific metadata */}
          <div className="flex gap-4 text-right">
            <Stat label="Cards" value={(inGrid ? scopeStats : totalStats).totalCards.toLocaleString()} />
            <Stat label="Unique" value={(inGrid ? scopeStats : totalStats).uniqueOracle.toLocaleString()} />
            <Stat
              label="Value (TCG)"
              value={`$${(inGrid ? scopeStats : totalStats).value.toFixed(0)}`}
              accent
            />
          </div>
        </div>

        {/* Add bar — always present */}
        <div className="mb-4 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearchModal(search);
                setSearch("");
              }
            }}
            placeholder="Add cards to your collection — type a name and press Enter…"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button
            onClick={() => setSearchModal(search)}
            className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
          >
            🔍 Browse cards
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="shrink-0 rounded-md border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-semibold text-stone-300 hover:bg-stone-800"
          >
            📥 Import CSV
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-3 px-4 pb-10">
        {cards === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : (cards.length === 0 ? (
          <div className="w-full rounded-xl border border-dashed border-stone-800 p-10 text-center">
            <p className="text-sm text-stone-500">
              Your collection is empty. Search above to add cards, or use Import CSV.
            </p>
          </div>
        ) : view.kind === "browse" ? (
          <div className="w-full">
            <SetsBrowser
              cards={cards.filter((c) => c.quantity > 0)}
              totalCards={totalStats.totalCards}
              onAll={() => setView({ kind: "all" })}
              onSet={(code, name) => setView({ kind: "set", code, name })}
            />
          </div>
        ) : (
          <>
            {showFilters && (
              <FilterSidebar
                filters={filters}
                onChange={setFilters}
                sort={sort}
                onSort={setSort}
                rarityMissing={scopeCards.length > 0 && scopeCards.every((c) => c.card.rarity === undefined)}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-800"
                >
                  {showFilters ? "◀ Hide filters" : "▶ Filters"}
                </button>
                {filtersActive(filters) && (
                  <span className="text-[11px] text-emerald-400">
                    {visible.length} match{visible.length === 1 ? "" : "es"}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-stone-500">
                  {visible.length} stack{visible.length === 1 ? "" : "s"}
                </span>
              </div>

              {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center text-sm text-stone-500">
                  No cards match these filters.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {shown.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col gap-1 rounded-lg border border-stone-800 bg-stone-950 p-2"
                      style={{ contentVisibility: "auto", containIntrinsicSize: "260px" }}
                    >
                      <button onClick={() => setDetailCard(c.card)} className="group relative text-left">
                        <CardImage
                          card={c.card}
                          className="aspect-[5/7] w-full transition group-hover:ring-2 group-hover:ring-sky-500"
                        />
                        <span className="absolute top-1 left-1 rounded-full bg-black/80 px-1.5 text-[10px] font-bold text-white">
                          ×{c.quantity}
                        </span>
                        {c.finish !== "nonfoil" && (
                          <span className="absolute top-1 right-1 rounded-full bg-amber-500 px-1.5 text-[9px] font-bold text-black">
                            {c.finish === "foil" ? "FOIL" : "ETCH"}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-stone-200" title={c.name}>
                          {c.name}
                        </span>
                        <ManaCost cost={c.card.mana_cost} size={10} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-stone-500">
                        <span className="truncate" title={c.setName}>
                          {c.setCode?.toUpperCase()} · {FINISH_LABEL[c.finish]}
                        </span>
                        <span className="text-emerald-400">
                          {finishPrice(c.card, c.finish) !== null
                            ? `$${(finishPrice(c.card, c.finish)! * c.quantity).toFixed(2)}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void changeQty(c, c.quantity - 1)}
                          className="h-6 w-6 rounded bg-stone-800 font-bold text-rose-400 hover:bg-stone-700"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={c.quantity}
                          onChange={(e) => void changeQty(c, Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-12 rounded border border-stone-700 bg-stone-900 px-1 py-0.5 text-center text-xs outline-none focus:border-emerald-600"
                        />
                        <button
                          onClick={() => void changeQty(c, c.quantity + 1)}
                          className="h-6 w-6 rounded bg-stone-800 font-bold text-emerald-400 hover:bg-stone-700"
                        >
                          +
                        </button>
                        <button
                          onClick={() => void changeQty(c, 0)}
                          className="ml-auto rounded bg-stone-800 px-2 py-0.5 text-[10px] font-semibold text-stone-400 hover:bg-stone-700 hover:text-rose-400"
                          title="Remove from collection"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                  {limit < visible.length && (
                    <div ref={sentinelRef} className="col-span-full py-6 text-center text-xs text-stone-600">
                      Loading more… ({shown.length} of {visible.length})
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ))}
      </div>

      <p className="px-4 pb-6 text-center text-[10px] text-stone-600">
        {getCardDbStatus().syncedAt
          ? "Card search uses your synced local database."
          : "Tip: sync the card database on the My decks page for faster offline search."}{" "}
        Prices are Scryfall (TCGplayer). {getRepo().mode === "local" ? "Stored locally." : "Stored in Supabase."}
      </p>

      {searchModal !== null && (
        <CardSearchModal
          initialQuery={searchModal}
          onOpenCard={(card) => setDetailCard(card)}
          onClose={() => {
            setSearchModal(null);
            void refresh();
          }}
        />
      )}
      {detailCard && (
        <CardDetailModal
          card={detailCard}
          onClose={() => {
            setDetailCard(null);
            void refresh();
          }}
          onNavigate={setDetailCard}
        />
      )}
      {importOpen && (
        <ImportCsvModal onClose={() => setImportOpen(false)} onImported={() => void refresh()} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-bold ${accent ? "text-emerald-300" : "text-stone-100"}`}>{value}</div>
      <div className="text-[10px] tracking-wide text-stone-500 uppercase">{label}</div>
    </div>
  );
}

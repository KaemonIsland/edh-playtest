"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScryCard } from "@/types";
import { collectionEntryId, finishPrice, getRepo, type CardFinish } from "@/lib/repo";
import { adjustCollection } from "@/lib/cards/collection";
import { fetchAllSets, fetchSetCards, type SetInfo } from "@/lib/cards/carddb";
import { cardComparator, type CardSort } from "@/lib/cards/sort";
import { CardDetailModal } from "@/components/builder/CardDetailModal";
import { CardSearchModal } from "@/components/builder/CardSearchModal";
import { CardGridTile } from "@/components/collection/CardGridTile";
import { SetGrid, type SetGridItem } from "@/components/collection/SetGrid";
import {
  FilterSidebar,
  emptyFilters,
  filtersActive,
  matchesFilters,
  type CardFilters,
} from "@/components/collection/FilterSidebar";

const PAGE = 60;

export default function AllCardsPage() {
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [active, setActive] = useState<SetInfo | null>(null);
  const [setCards, setSetCards] = useState<ScryCard[] | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);

  // Owned quantities keyed by `${printingId}:${finish}`.
  const [owned, setOwned] = useState<Map<string, number>>(new Map());

  const [filters, setFilters] = useState<CardFilters>(emptyFilters);
  const [sort, setSort] = useState<CardSort>("color");
  const [showFilters, setShowFilters] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [detailCard, setDetailCard] = useState<ScryCard | null>(null);
  const [searchModal, setSearchModal] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refreshOwned = useCallback(async () => {
    const list = await getRepo().listCollection();
    setOwned(new Map(list.map((c) => [c.id, c.quantity])));
  }, []);

  useEffect(() => {
    void fetchAllSets().then(setSets);
    void refreshOwned();
  }, [refreshOwned]);

  const openSet = async (s: SetInfo) => {
    setActive(s);
    setSetCards(null);
    setLoadingCards(true);
    try {
      setSetCards(await fetchSetCards(s.code));
    } finally {
      setLoadingCards(false);
    }
  };

  const ownedQty = (printingId: string, finish: CardFinish) =>
    owned.get(collectionEntryId(printingId, finish)) ?? 0;

  const adjust = async (card: ScryCard, finish: CardFinish, delta: number) => {
    const next = await adjustCollection(card, finish, delta);
    setOwned((prev) => {
      const m = new Map(prev);
      m.set(collectionEntryId(card.id, finish), next);
      return m;
    });
  };

  const setItems: SetGridItem[] = useMemo(
    () =>
      (sets ?? []).map((s) => ({
        code: s.code,
        name: s.name,
        released: s.released_at,
        icon: s.icon_svg_uri,
        type: s.set_type,
        primary: `${s.card_count} cards`,
      })),
    [sets],
  );

  const visibleCards = useMemo(() => {
    const filtered = (setCards ?? []).filter((c) => matchesFilters(c, filters));
    const priceByCard = new Map<ScryCard, number>();
    if (sort === "value") for (const c of filtered) priceByCard.set(c, finishPrice(c, "nonfoil") ?? 0);
    const cmp = cardComparator(sort, (sc) => priceByCard.get(sc) ?? 0);
    return [...filtered].sort(cmp);
  }, [setCards, filters, sort]);

  useEffect(() => {
    setLimit(PAGE);
  }, [active, filters, sort]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) setLimit((n) => n + PAGE);
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCards.length]);
  const shownCards = visibleCards.slice(0, limit);

  const ownedInSet = useMemo(() => {
    if (!setCards) return 0;
    let n = 0;
    for (const c of setCards) n += ownedQty(c.id, "nonfoil") + ownedQty(c.id, "foil") + ownedQty(c.id, "etched");
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCards, owned]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#08080a] text-stone-200">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <nav className="mb-4 flex gap-4 text-xs text-stone-400">
          <Link href="/" className="hover:text-white">Home</Link>
          <Link href="/collection" className="hover:text-white">Collection</Link>
          <Link href="/decks" className="hover:text-white">My decks</Link>
          <span className="font-semibold text-stone-200">All cards</span>
        </nav>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            {active && (
              <button
                onClick={() => {
                  setActive(null);
                  setSetCards(null);
                }}
                className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
              >
                ← Sets
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {active ? active.name : "All cards"}
              </h1>
              <p className="mt-0.5 text-sm text-stone-500">
                {active
                  ? "Add the cards you pulled — +/- updates your collection."
                  : "Pick a set to browse and add cards you opened or bought."}
              </p>
            </div>
          </div>
          {active && (
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-300">{ownedInSet}</div>
              <div className="text-[10px] tracking-wide text-stone-500 uppercase">Owned in set</div>
            </div>
          )}
        </div>

        {/* Quick card search (any card, any set) */}
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
            placeholder="Find any card by name and add it (press Enter)…"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button
            onClick={() => setSearchModal(search)}
            className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
          >
            🔍 Search all cards
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-3 px-4 pb-10">
        {!active ? (
          // Set browser
          <div className="w-full">
            <SetGrid
              items={setItems}
              loading={sets === null}
              onSelect={(code) => {
                const s = sets?.find((x) => x.code === code);
                if (s) void openSet(s);
              }}
            />
          </div>
        ) : (
          // Set card grid
          <>
            {showFilters && (
              <FilterSidebar filters={filters} onChange={setFilters} sort={sort} onSort={setSort} />
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
                  <span className="text-[11px] text-emerald-400">{visibleCards.length} matches</span>
                )}
                <span className="ml-auto text-[11px] text-stone-500">
                  {visibleCards.length} cards
                </span>
              </div>

              {loadingCards || setCards === null ? (
                <p className="text-sm text-stone-600">Loading {active.name}…</p>
              ) : visibleCards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center text-sm text-stone-500">
                  No cards match these filters.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {shownCards.map((c) => (
                    <CardGridTile
                      key={c.id}
                      card={c}
                      owned={ownedQty(c.id, "nonfoil")}
                      price={finishPrice(c, "nonfoil")}
                      onOpen={() => setDetailCard(c)}
                      onAdjust={(d) => void adjust(c, "nonfoil", d)}
                    />
                  ))}
                  {limit < visibleCards.length && (
                    <div ref={sentinelRef} className="col-span-full py-6 text-center text-xs text-stone-600">
                      Loading more… ({shownCards.length} of {visibleCards.length})
                    </div>
                  )}
                </div>
              )}
              <p className="mt-3 text-[10px] text-stone-600">
                +/- adds nonfoil copies. For foil/etched or other printings, click a card → Collection
                Records.
              </p>
            </div>
          </>
        )}
      </div>

      {detailCard && (
        <CardDetailModal
          card={detailCard}
          onClose={() => {
            setDetailCard(null);
            void refreshOwned();
          }}
          onNavigate={setDetailCard}
        />
      )}
      {searchModal !== null && (
        <CardSearchModal
          initialQuery={searchModal}
          onOpenCard={(card) => setDetailCard(card)}
          onClose={() => {
            setSearchModal(null);
            void refreshOwned();
          }}
        />
      )}
    </div>
  );
}

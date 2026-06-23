"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScryCard } from "@/types";
import { getRepo, type CollectionCard } from "@/lib/repo";
import {
  loadPriceIndex,
  priceOf,
  usePriceStore,
  PRICE_SOURCE_LABEL,
  getPriceSyncStatus,
  type PriceSource,
} from "@/lib/cards/pricing";
import { collectionStats, enrichCollectionFromOracle, setCollectionQty } from "@/lib/cards/collection";
import { adjustWishlist } from "@/lib/cards/wishlist";
import { collectionToCsv } from "@/lib/cards/collectionCsv";
import { downloadTextFile } from "@/lib/download";
import type { WishlistCard } from "@/lib/repo";
import { getCardDbStatus, fetchAllSets, type SetInfo } from "@/lib/cards/carddb";
import { groupBySet } from "@/lib/cards/sets";
import { cardComparator, type CardSort } from "@/lib/cards/sort";
import { CardGridTile } from "@/components/collection/CardGridTile";
import { SetGrid, type SetGridItem } from "@/components/collection/SetGrid";
import { CardSearchModal } from "@/components/builder/CardSearchModal";
import { CardDetailModal } from "@/components/builder/CardDetailModal";
import { ImportCsvModal } from "@/components/collection/ImportCsvModal";
import { MigrationBanner } from "@/components/MigrationBanner";
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
  const [wishlist, setWishlist] = useState<WishlistCard[] | null>(null);
  const [mode, setMode] = useState<"collection" | "wishlist">("collection");
  const [view, setView] = useState<View>({ kind: "browse" });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CardFilters>(emptyFilters);
  const [sort, setSort] = useState<CardSort>("color");
  const [showFilters, setShowFilters] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [searchModal, setSearchModal] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<ScryCard | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  // Re-render / recompute card values when the price source or index changes.
  const priceSource = usePriceStore((s) => s.source);
  const priceVersion = usePriceStore((s) => s.version);

  useEffect(() => {
    void loadPriceIndex();
  }, []);

  const refresh = useCallback(async () => {
    const list = await getRepo().listCollection();
    setCards(list);
    void getRepo().listWishlist().then(setWishlist);
    void getRepo().listUnresolvedImports().then((u) => setUnresolvedCount(u.length));
    // Backfill rarity/keywords/release date on older rows (best-effort).
    const enriched = await enrichCollectionFromOracle(list);
    if (enriched !== list) setCards(enriched);
  }, []);

  const wishlistVisible = useMemo(() => {
    const filtered = (wishlist ?? []).filter((w) => w.quantity > 0 && matchesFilters(w.card, filters));
    const cmp = cardComparator(sort, (sc) => priceOf(sc, "nonfoil") ?? 0);
    return [...filtered].sort((a, b) => cmp(a.card, b.card));
  }, [wishlist, filters, sort, priceSource, priceVersion]);

  const changeWish = async (w: WishlistCard, qty: number) => {
    setWishlist((prev) =>
      (prev ?? [])
        .map((x) => (x.oracleId === w.oracleId ? { ...x, quantity: qty } : x))
        .filter((x) => x.quantity > 0),
    );
    await adjustWishlist(w.card, qty - w.quantity);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cards in the current scope (all vs a set), before filters.
  const scopeCards = useMemo(() => {
    const all = (cards ?? []).filter((c) => c.quantity > 0);
    if (view.kind === "set") return all.filter((c) => (c.setCode ?? c.card.set) === view.code);
    return all;
  }, [cards, view]);

  const scopeStats = useMemo(
    () => collectionStats(scopeCards),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeCards, priceSource, priceVersion],
  );

  const visible = useMemo(() => {
    const filtered = scopeCards.filter((c) => matchesFilters(c.card, filters));
    // Precompute stack value so the comparator's price lookup is O(1), not O(n).
    const priceByCard = new Map<ScryCard, number>();
    if (sort.startsWith("value")) {
      for (const c of filtered) priceByCard.set(c.card, (priceOf(c.card, c.finish) ?? 0) * c.quantity);
    }
    const cmp = cardComparator(sort, (sc) => priceByCard.get(sc) ?? 0);
    return [...filtered].sort((a, b) => cmp(a.card, b.card));
  }, [scopeCards, filters, sort, priceSource, priceVersion]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, priceSource, priceVersion],
  );

  // Full set list (for total card counts on the owned-sets grid).
  const [allSets, setAllSets] = useState<SetInfo[] | null>(null);
  useEffect(() => {
    void fetchAllSets().then(setAllSets);
  }, []);

  const ownedSetItems: SetGridItem[] = useMemo(() => {
    const owned = groupBySet((cards ?? []).filter((c) => c.quantity > 0));
    const byCode = new Map((allSets ?? []).map((s) => [s.code, s]));
    return owned.map((g) => {
      const info = byCode.get(g.code);
      const total = info?.card_count;
      return {
        code: g.code,
        name: info?.name ?? g.name,
        released: info?.released_at ?? g.released,
        icon: info?.icon_svg_uri,
        type: info?.set_type,
        primary: total ? `${g.unique}/${total} cards` : `${g.unique} cards`,
        secondary: g.value > 0 ? `$${g.value.toFixed(0)}` : undefined,
      };
    });
  }, [cards, allSets]);

  const inGrid = view.kind !== "browse";

  return (
    <div className="flex min-h-dvh flex-col bg-[#08080a] text-stone-200">
      {/* Header */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <nav className="mb-4 flex gap-4 text-xs text-stone-400">
          <Link href="/" className="hover:text-white">Home</Link>
          <Link href="/cards" className="hover:text-white">All cards</Link>
          <Link href="/decks" className="hover:text-white">My decks</Link>
          <span className="font-semibold text-stone-200">Collection</span>
        </nav>

        <MigrationBanner />

        {unresolvedCount > 0 && (
          <Link
            href="/collection/resolve"
            className="mb-4 flex items-center gap-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm transition hover:border-amber-600 hover:bg-amber-950/50"
          >
            <span className="text-lg">🔎</span>
            <span className="flex-1 text-amber-200">
              <strong>{unresolvedCount}</strong> card{unresolvedCount === 1 ? "" : "s"} from a CSV
              import couldn’t be matched automatically.
            </span>
            <span className="shrink-0 text-xs font-bold text-amber-300">Resolve manually →</span>
          </Link>
        )}

        {/* Collection / Wishlist toggle */}
        <div className="mb-4 inline-flex gap-0.5 rounded-lg bg-stone-900 p-0.5">
          {(
            [
              ["collection", "📚 Collection"],
              ["wishlist", `⭐ Wishlist${wishlist?.length ? ` (${wishlist.length})` : ""}`],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                mode === m ? "bg-stone-700 text-white" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "wishlist" ? (
          <div className="mb-4">
            <h1 className="text-2xl font-bold tracking-tight">Wishlist</h1>
            <p className="mt-0.5 text-sm text-stone-500">
              Cards you want. Add from any card’s detail, or “add missing” from a deck’s coverage.
            </p>
          </div>
        ) : (
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
                label={`Value (${PRICE_SOURCE_LABEL[priceSource]})`}
                value={`$${(inGrid ? scopeStats : totalStats).value.toFixed(0)}`}
                accent
              />
            </div>
          </div>
        )}

        {/* Add bar — collection mode */}
        {mode === "collection" && (
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
            <button
              onClick={() => {
                const owned = (cards ?? []).filter((c) => c.quantity > 0);
                if (owned.length === 0) return;
                downloadTextFile(
                  `collection-${new Date().toISOString().slice(0, 10)}.csv`,
                  collectionToCsv(owned),
                  "text/csv",
                );
              }}
              disabled={(cards?.length ?? 0) === 0}
              className="shrink-0 rounded-md border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-semibold text-stone-300 hover:bg-stone-800 disabled:opacity-40"
            >
              📤 Export CSV
            </button>
            <PriceSourceToggle />
          </div>
        )}
      </div>

      {/* Wishlist body */}
      {mode === "wishlist" && (
        <div className="mx-auto flex w-full max-w-6xl flex-1 gap-3 px-4 pb-10">
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
              <span className="ml-auto text-[11px] text-stone-500">{wishlistVisible.length} cards</span>
            </div>
            {wishlist === null ? (
              <p className="text-sm text-stone-600">Loading…</p>
            ) : wishlistVisible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center text-sm text-stone-500">
                {(wishlist.length ?? 0) === 0
                  ? "Your wishlist is empty. Add cards from any card's detail view (Collection Records → ⭐ Wishlist)."
                  : "No wishlist cards match these filters."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {wishlistVisible.map((w) => (
                  <CardGridTile
                    key={w.oracleId}
                    card={w.card}
                    owned={w.quantity}
                    price={priceOf(w.card, "nonfoil")}
                    onOpen={() => setDetailCard(w.card)}
                    onAdjust={(d) => void changeWish(w, w.quantity + d)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collection body */}
      {mode === "collection" && (
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
            {/* All cards bar */}
            <button
              onClick={() => setView({ kind: "all" })}
              className="mb-4 flex w-full items-center gap-3 rounded-xl border border-stone-700 bg-gradient-to-r from-stone-900 to-stone-950 px-4 py-4 text-left transition hover:border-emerald-600/60"
            >
              <span className="text-2xl">🗃️</span>
              <div className="flex-1">
                <div className="text-base font-bold text-stone-100">All cards</div>
                <div className="text-xs text-stone-500">Browse and filter your entire collection</div>
              </div>
              <span className="text-sm font-bold text-stone-300">
                {totalStats.totalCards.toLocaleString()} cards
              </span>
              <span className="text-stone-600">→</span>
            </button>
            <SetGrid
              items={ownedSetItems}
              onSelect={(code, name) => setView({ kind: "set", code, name })}
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
                    <CardGridTile
                      key={c.id}
                      card={c.card}
                      owned={c.quantity}
                      finishBadge={c.finish === "foil" ? "FOIL" : c.finish === "etched" ? "ETCH" : null}
                      price={priceOf(c.card, c.finish)}
                      onOpen={() => setDetailCard(c.card)}
                      onAdjust={(d) => void changeQty(c, c.quantity + d)}
                    />
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
      )}

      <p className="px-4 pb-6 text-center text-[10px] text-stone-600">
        {getCardDbStatus().syncedAt
          ? "Card search uses your synced local database."
          : "Tip: sync the card database on the My decks page for faster offline search."}{" "}
        Prices are {PRICE_SOURCE_LABEL[priceSource]} (
        {getPriceSyncStatus().syncedAt ? "MTGJSON" : "Scryfall fallback — sync prices on My decks"}).{" "}
        {getRepo().mode === "supabase" ? "Stored in Supabase." : "Stored in your local database."}
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

/** Segmented control to pick the price provider (persisted in localStorage). */
function PriceSourceToggle() {
  const source = usePriceStore((s) => s.source);
  const setSource = usePriceStore((s) => s.setSource);
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-md bg-stone-900 p-0.5"
      title="Which retailer's prices to show (synced from MTGJSON)"
    >
      {(["tcgplayer", "cardkingdom"] as PriceSource[]).map((s) => (
        <button
          key={s}
          onClick={() => setSource(s)}
          className={`rounded px-2.5 py-1.5 text-xs font-semibold transition ${
            source === s ? "bg-stone-700 text-white" : "text-stone-400 hover:text-stone-200"
          }`}
        >
          {PRICE_SOURCE_LABEL[s]}
        </button>
      ))}
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

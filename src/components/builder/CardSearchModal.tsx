"use client";

import { Backpack, Crown, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deck, ScryCard } from "@/types";
import {
  advancedSearchCards,
  byNewest,
  fetchAllSets,
  fetchPrintingsByOracleIds,
  getCardDbStatus,
  type SearchFilters,
  type SetInfo,
} from "@/lib/cards/carddb";
import { TYPE_OPTIONS } from "@/lib/cards/cardTypes";
import { collectionEntryId, getRepo, type CardFinish } from "@/lib/repo";
import { adjustCollection } from "@/lib/cards/collection";
import { OTAGS } from "@/lib/cards/otags";
import { getSearchScope, setSearchScope, type SearchScope } from "@/lib/cards/smartSearch";
import { loadPriceIndex, usePriceStore } from "@/lib/cards/pricing";
import {
  emptyFilters,
  filtersActive,
  matchesFilters,
  type CardFilters,
} from "@/components/collection/FilterSidebar";
import { PrintingTile } from "@/components/collection/PrintingTile";
import { TokenMultiSelect, type TokenOption } from "@/components/collection/TokenMultiSelect";

/** Above this many distinct cards, skip expanding to every printing (too many). */
const EXPAND_CARD_CAP = 60;
/** Results shown per page; "Load more" reveals the next batch. */
const RESULTS_PAGE = 48;

const COLORS = ["W", "U", "B", "R", "G", "C"] as const;
const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
const OPS = ["=", ">=", "<="] as const;

const TYPE_TOKEN_OPTIONS: TokenOption[] = TYPE_OPTIONS.map((t) => ({ value: t }));

interface ExtraFilters {
  keyword: string;
  sets: string[];
  artist: string;
}

/** Map the shared filter shape (+ keyword/sets/artist) to the search engine filters. */
function toSearchFilters(f: CardFilters, extra: ExtraFilters): SearchFilters {
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
    keyword: extra.keyword.trim() || undefined,
    sets: extra.sets.length ? extra.sets : undefined,
    artist: extra.artist.trim() || undefined,
    commander: f.commanderOnly || undefined,
  };
}

/** Full-screen card search with Scryfall-like advanced filters. */
export function CardSearchModal({
  initialQuery,
  initialOtag,
  onOpenCard,
  onClose,
  deck,
  update,
  onScopeChange,
}: {
  initialQuery: string;
  /** Pre-filled oracle tag (from a suggestion chip). */
  initialOtag?: string;
  /** Clicking a card opens its detail modal (where it can be added). */
  onOpenCard: (card: ScryCard) => void;
  onClose: () => void;
  /** Deck-add mode: when provided, result tiles add the printing straight to
   * this deck (via `update`) instead of to the collection. */
  deck?: Deck;
  update?: (fn: (d: Deck) => void) => void;
  /** Keeps the builder toolbar's Collection/All toggle in sync. */
  onScopeChange?: (scope: SearchScope) => void;
}) {
  const deckMode = !!deck && !!update;
  const [filters, setFilters] = useState<CardFilters>(() => ({ ...emptyFilters(), name: initialQuery }));
  const [keyword, setKeyword] = useState("");
  const [sets, setSets] = useState<string[]>([]);
  const [artist, setArtist] = useState("");
  const [otag, setOtag] = useState(initialOtag ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [scope, setScope] = useState<SearchScope>(() => getSearchScope());
  const ownedOnly = scope === "collection";

  const changeScope = (s: SearchScope) => {
    setScope(s);
    setSearchScope(s);
    onScopeChange?.(s);
  };
  const [results, setResults] = useState<ScryCard[] | null>(null);
  const [shownCount, setShownCount] = useState(RESULTS_PAGE);
  const [searching, setSearching] = useState(false);
  const [owned, setOwned] = useState<Map<string, number>>(new Map());
  const [setList, setSetList] = useState<SetInfo[]>([]);
  // Re-render tiles (and their prices) when the price index loads.
  const priceVersion = usePriceStore((s) => s.version);

  useEffect(() => {
    void loadPriceIndex();
    void fetchAllSets().then(setSetList);
  }, []);

  const setOptions: TokenOption[] = useMemo(
    () =>
      setList.map((s) => ({
        value: s.code,
        label: `${s.name} (${s.code.toUpperCase()})`,
        hint: s.released_at?.slice(0, 4),
      })),
    [setList],
  );

  const refreshOwned = useCallback(async () => {
    const list = await getRepo().listCollection();
    setOwned(new Map(list.map((c) => [c.id, c.quantity])));
  }, []);
  useEffect(() => {
    void refreshOwned();
  }, [refreshOwned]);

  const ownedQty = (printingId: string, finish: CardFinish) =>
    owned.get(collectionEntryId(printingId, finish)) ?? 0;

  /** Add/remove a specific printing+finish, updating the owned counts in place. */
  const adjust = async (card: ScryCard, finish: CardFinish, delta: number) => {
    const next = await adjustCollection(card, finish, delta);
    setOwned((prev) => {
      const m = new Map(prev);
      m.set(collectionEntryId(card.id, finish), next);
      return m;
    });
  };

  // Deck-add mode: copies already in the deck, keyed by oracle id.
  const deckQtyByOracle = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck?.entries ?? []) m.set(e.card.oracle_id, e.quantity);
    return m;
  }, [deck?.entries]);

  /** Add/remove this card in the deck (mirrors the card detail quantity logic). */
  const adjustDeck = (card: ScryCard, delta: number) => {
    update?.((d) => {
      const e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
      if (e) {
        const next = e.quantity + delta;
        if (next <= 0) {
          d.entries = d.entries.filter((x) => x.card.oracle_id !== card.oracle_id);
          d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
        } else {
          e.quantity = next;
        }
      } else if (delta > 0) {
        // New entry adopts the clicked printing (Collection scope already
        // surfaces the printing you own).
        d.entries.push({
          card,
          quantity: delta,
          isCommander: false,
          categories: [],
          addedAt: Date.now(),
        });
      }
    });
  };

  const setF = (patch: Partial<CardFilters>) => setFilters((p) => ({ ...p, ...patch }));
  const toggle = (key: "types" | "colors" | "rarities", value: string) =>
    setFilters((p) => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter((x) => x !== value) : [...p[key], value],
    }));

  const run = useCallback(async (otagOverride?: string) => {
    const tag = (otagOverride ?? otag).trim();
    setSearching(true);
    setShownCount(RESULTS_PAGE);
    try {
      if (tag) {
        // Oracle tags live on Scryfall's side. Commander colors are applied
        // by default in deck mode (unless colors were chosen explicitly), and
        // Collection scope intersects the results with what you own.
        const f = toSearchFilters(filters, { keyword, sets, artist });
        f.otag = tag;
        if (deckMode && (!f.colors || f.colors.length === 0) && deck!.colorIdentity.length > 0) {
          f.colors = deck!.colorIdentity;
          f.colorMode = "identity";
        }
        const base = await advancedSearchCards(f, 175);
        if (ownedOnly) {
          const collection = await getRepo().listCollection();
          const byOracle = new Map<string, ScryCard>();
          for (const c of collection) {
            if (c.quantity > 0 && !byOracle.has(c.oracleId)) byOracle.set(c.oracleId, c.card);
          }
          setResults(
            base.filter((c) => byOracle.has(c.oracle_id)).map((c) => byOracle.get(c.oracle_id) ?? c),
          );
        } else {
          setResults(base);
        }
        return;
      }
      if (ownedOnly) {
        // Browse the collection itself (works without the card DB synced).
        const collection = await getRepo().listCollection();
        const byOracle = new Map<string, ScryCard>();
        for (const c of collection) if (c.quantity > 0) byOracle.set(c.oracleId, c.card);
        const kw = keyword.trim().toLowerCase();
        const setSet = new Set(sets.map((s) => s.toLowerCase()));
        // Note: artist is a printing-level credit and isn't stored on collection
        // (oracle) cards, so it's ignored in owned-only mode.
        const cards = [...byOracle.values()]
          .filter((c) => matchesFilters(c, filters))
          .filter((c) => !kw || (c.keywords ?? []).some((k) => k.toLowerCase() === kw))
          .filter((c) => !setSet.size || setSet.has((c.set ?? "").toLowerCase()))
          .sort(byNewest);
        setResults(cards);
        return;
      }
      const base = await advancedSearchCards(toSearchFilters(filters, { keyword, sets, artist }));
      // Expand to every printing (all variants) for narrow result sets, so the
      // exact one can be added without drilling into each card. Grouped by the
      // card's search rank, newest printing first. Falls back to the oracle-level
      // results when broad, or when the local printings DB isn't synced.
      if (base.length > 0 && base.length <= EXPAND_CARD_CAP) {
        const prints = await fetchPrintingsByOracleIds(base.map((c) => c.oracle_id));
        if (prints.length > 0) {
          const order = new Map(base.map((c, i) => [c.oracle_id, i]));
          prints.sort((a, b) => {
            const oa = order.get(a.oracle_id) ?? 1e9;
            const ob = order.get(b.oracle_id) ?? 1e9;
            if (oa !== ob) return oa - ob;
            return (b.released_at ?? "").localeCompare(a.released_at ?? "");
          });
          setResults(prints);
          return;
        }
      }
      setResults(base);
    } finally {
      setSearching(false);
    }
  }, [filters, keyword, sets, artist, ownedOnly, otag, deckMode, deck]);

  // Run the initial query immediately.
  useEffect(() => {
    if (initialQuery.trim() || initialOtag?.trim()) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder="Card name…"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <div
            className="flex shrink-0 gap-0.5 rounded-lg border border-stone-700 bg-stone-900 p-0.5"
            title="Collection: search cards you own first. All cards: search everything."
          >
            {(["collection", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => changeScope(s)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  scope === s
                    ? s === "collection"
                      ? "bg-emerald-800 text-white"
                      : "bg-stone-700 text-white"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {s === "collection" ? <><Backpack size={12} className="inline align-[-2px]" /> Collection</> : "All cards"}
              </button>
            ))}
          </div>
          <button
            onClick={() => void run()}
            disabled={searching}
            className="shrink-0 rounded-md bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <button onClick={onClose} className="shrink-0 rounded px-2 py-1 text-stone-500 hover:text-stone-200">
            <X size={14} />
          </button>
        </div>

        {/* Oracle tags — Scryfall's community tagger, e.g. otag:ramp */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className="text-[10px] font-bold tracking-wide text-stone-500 uppercase"
            title="Scryfall oracle tags (community 'function' tags). Deck color identity is applied automatically."
          >
            Otag
          </span>
          <input
            value={otag}
            onChange={(e) => setOtag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder="e.g. copy…"
            className="w-28 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs outline-none focus:border-emerald-600"
          />
          {OTAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                const next = otag === tag ? "" : tag;
                setOtag(next);
                if (next) void run(next);
              }}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                otag === tag
                  ? "bg-emerald-700 text-white"
                  : "bg-stone-900 text-stone-500 hover:text-stone-200"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Advanced options */}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setAdvanced(!advanced)}
            className="text-xs font-semibold text-stone-400 hover:text-stone-200"
          >
            {advanced ? "▾" : "▸"} Advanced options
          </button>
          {filtersActive(filters) || keyword || sets.length || artist || otag ? (
            <button
              onClick={() => {
                setFilters(emptyFilters());
                setKeyword("");
                setSets([]);
                setArtist("");
                setOtag("");
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
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void run()}
                  placeholder="Artist"
                  className="w-40 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Types — pick card types or subtypes (Aura, Adventure, Elf…). */}
            <div>
              <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                Type / subtype
              </div>
              <TokenMultiSelect
                options={TYPE_TOKEN_OPTIONS}
                selected={filters.types}
                onChange={(types) => setF({ types })}
                placeholder="Type to filter — e.g. Aura, Adventure, Elf…"
                allowCustom
                onSubmit={() => void run()}
              />
            </div>

            {/* Sets — filter-as-you-type multi-select. */}
            <div>
              <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                Sets
              </div>
              <TokenMultiSelect
                options={setOptions}
                selected={sets}
                onChange={setSets}
                placeholder={setOptions.length ? "Type a set name or code…" : "Loading sets…"}
                onSubmit={() => void run()}
              />
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
              <Crown size={13} className="inline align-[-2px]" /> Can be commander
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
              on “My decks” to populate those fields. Artist search and unsynced searches run via
              Scryfall.
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
                {results.length} result{results.length === 1 ? "" : "s"}
                {shownCount < results.length ? ` (showing ${shownCount})` : ""} —{" "}
                {deckMode
                  ? "use “+ Add to deck”, or click a card for full details."
                  : "use −/+ to add a printing, or click a card for full details."}
              </p>
              <div
                data-pv={priceVersion}
                className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4"
              >
                {results.slice(0, shownCount).map((card) => (
                  <PrintingTile
                    key={card.id}
                    card={card}
                    ownedNonfoil={ownedQty(card.id, "nonfoil")}
                    ownedFoil={ownedQty(card.id, "foil")}
                    showName
                    onOpen={() => onOpenCard(card)}
                    {...(deckMode
                      ? {
                          deckQty: deckQtyByOracle.get(card.oracle_id) ?? 0,
                          onAdjustDeck: (d: number) => adjustDeck(card, d),
                        }
                      : { onAdjust: (finish: CardFinish, d: number) => adjust(card, finish, d) })}
                  />
                ))}
                {shownCount < results.length && (
                  <button
                    onClick={() => setShownCount((n) => n + RESULTS_PAGE)}
                    className="col-span-full rounded-md border border-stone-700 bg-stone-900 py-2.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
                  >
                    Load more ({results.length - shownCount} more)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

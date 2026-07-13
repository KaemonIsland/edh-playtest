"use client";

import { CARD_GRID } from "@/components/ui/CardSizeSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Backpack, Check, Lightbulb, TrendingUp } from "lucide-react";
import type { Deck, ScryCard } from "@/types";
import { isBoardCategory } from "@/types";
import { getRepo } from "@/lib/repo";
import { OTAGS } from "@/lib/cards/otags";
import type { NumOp } from "@/lib/cards/carddb";
import { cardComparator, type CardSort } from "@/lib/cards/sort";
import { loadPriceIndex, priceOf, usePriceStore } from "@/lib/cards/pricing";
import { scryfallSearch, type SearchScope, getSearchScope } from "@/lib/cards/smartSearch";
import {
  fetchEdhrecSuggestions,
  lookupResolved,
  resolveNames,
  type EdhrecSuggestion,
} from "@/lib/cards/suggest";
import { ModalShell } from "@/components/ui/ModalShell";
import { Seg } from "@/components/ui/Seg";
import {
  ColorPicker,
  NumberFilter,
  RarityChips,
  SortSelect,
  TypeChips,
} from "@/components/cards/FilterControls";
import { PrintingTile } from "@/components/collection/PrintingTile";

/**
 * Card discovery for the deck being built. Two sources:
 * - Otags: Scryfall oracle tags combined with type/color/cmc/rarity filters
 *   ("creatures that ramp", "blue draw spells"), commander identity applied.
 * - EDHREC: the commander's page, sorted by *synergy* by default — cards that
 *   over-perform with this commander specifically, not the generic staples
 *   that top every inclusion list.
 * Collection scope answers from what you own (and adds your printing).
 */

type Source = "otag" | "edhrec";

const SUGGEST_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Land",
] as const;

const EDHREC_SORTS = [
  { value: "synergy", label: "Synergy (default)" },
  { value: "popularity", label: "Popularity" },
];

interface Row {
  card: ScryCard;
  synergy?: number;
  numDecks?: number;
}

interface OwnedInfo {
  card: ScryCard;
  nonfoil: number;
  foil: number;
}

export function SuggestionsModal({
  deck,
  update,
  initialOtag,
  initialCategory,
  onOpenCard,
  onClose,
}: {
  deck: Deck;
  update: (fn: (d: Deck) => void) => void;
  /** Pre-selected otag (from a skeleton row click). */
  initialOtag?: string;
  /** Category assigned to cards added from here (from a skeleton row click). */
  initialCategory?: string;
  onOpenCard: (card: ScryCard) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source>("otag");
  const [otags, setOtags] = useState<string[]>(initialOtag ? [initialOtag] : []);
  const [customTag, setCustomTag] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [mvOp, setMvOp] = useState<NumOp>("<=");
  const [mv, setMv] = useState("");
  const [rarities, setRarities] = useState<string[]>([]);
  const [scope, setScope] = useState<SearchScope>(() => getSearchScope());
  const [sort, setSort] = useState<string>("color");
  const [edhrecSortValue, setEdhrecSortValue] = useState<string>("synergy");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // EDHREC data is fetched/resolved once per commander and filtered locally.
  const [edhrecRows, setEdhrecRows] = useState<Row[] | null>(null);
  const [ownedMap, setOwnedMap] = useState<Map<string, OwnedInfo>>(new Map());
  const priceVersion = usePriceStore((s) => s.version);

  const identity = deck.colorIdentity.length > 0 ? deck.colorIdentity : [];
  const identityLetters = identity.join("").toLowerCase() || "c";

  useEffect(() => {
    void loadPriceIndex();
    void getRepo()
      .listCollection()
      .then((list) => {
        const m = new Map<string, OwnedInfo>();
        for (const c of list) {
          if (c.quantity <= 0) continue;
          const info = m.get(c.oracleId) ?? { card: c.card, nonfoil: 0, foil: 0 };
          if (c.finish === "foil") info.foil += c.quantity;
          else info.nonfoil += c.quantity;
          m.set(c.oracleId, info);
        }
        setOwnedMap(m);
      });
  }, []);

  const deckOracles = useMemo(() => {
    const main = new Set<string>();
    const maybe = new Set<string>();
    const settings = deck.categorySettings ?? {};
    for (const e of deck.entries) {
      const cat = e.categories[0];
      const excluded = !!cat && settings[cat]?.inDeck === false;
      (excluded ? maybe : main).add(e.card.oracle_id);
    }
    return { main, maybe };
  }, [deck]);

  /** Client-side filter shared by both sources. */
  const passesFilters = useCallback(
    (card: ScryCard): boolean => {
      if (types.length > 0) {
        const tl = card.type_line.toLowerCase();
        if (!types.every((t) => tl.includes(t.toLowerCase()))) return false;
      }
      if (colors.length > 0) {
        const cc = card.colors ?? card.card_faces?.[0]?.colors ?? [];
        if (!cc.some((c) => colors.includes(c))) return false;
      }
      if (mv.trim()) {
        const t = parseFloat(mv);
        if (Number.isFinite(t)) {
          if (mvOp === "=" && card.cmc !== t) return false;
          if (mvOp === "<=" && card.cmc > t) return false;
          if (mvOp === ">=" && card.cmc < t) return false;
        }
      }
      if (rarities.length > 0 && !rarities.includes((card.rarity ?? "").toLowerCase()))
        return false;
      if (scope === "collection" && !ownedMap.has(card.oracle_id)) return false;
      return true;
    },
    [types, colors, mv, mvOp, rarities, scope, ownedMap],
  );

  const runOtag = useCallback(async () => {
    const tags = [...otags, ...(customTag.trim() ? [customTag.trim()] : [])];
    if (tags.length === 0 && types.length === 0) {
      setRows([]);
      setError("Pick at least one tag (or a type) to search.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const parts: string[] = [];
      for (const t of tags) parts.push(`otag:${t.toLowerCase().replace(/\s+/g, "-")}`);
      for (const t of types) parts.push(`t:${t.toLowerCase()}`);
      if (colors.length > 0)
        parts.push(`(${colors.map((c) => `c:${c.toLowerCase()}`).join(" or ")})`);
      if (mv.trim() && Number.isFinite(parseFloat(mv)))
        parts.push(`cmc${mvOp === "=" ? "=" : mvOp}${mv}`);
      if (rarities.length > 0) parts.push(`(${rarities.map((r) => `r:${r}`).join(" or ")})`);
      parts.push(`id<=${identityLetters}`, "legal:commander");
      const cards = await scryfallSearch(parts.join(" "), 175);
      const filtered = cards
        .filter((c) => !deckOracles.main.has(c.oracle_id))
        .filter((c) => scope !== "collection" || ownedMap.has(c.oracle_id))
        .map((c) => ({ card: (scope === "collection" && ownedMap.get(c.oracle_id)?.card) || c }));
      setRows(filtered);
      if (filtered.length === 0) setError("No matches — try fewer filters or another tag.");
    } finally {
      setLoading(false);
    }
  }, [otags, customTag, types, colors, mv, mvOp, rarities, identityLetters, scope, ownedMap, deckOracles]);

  const loadEdhrec = useCallback(async () => {
    const commander = deck.commanders[0]?.name;
    if (!commander) {
      setError("Set a commander first — EDHREC suggestions are per-commander.");
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const suggestions: EdhrecSuggestion[] = await fetchEdhrecSuggestions(commander);
      const resolved = await resolveNames(suggestions.map((s) => s.name));
      const out: Row[] = [];
      const seen = new Set<string>();
      for (const s of suggestions) {
        const card = lookupResolved(resolved, s.name);
        if (!card || seen.has(card.oracle_id)) continue;
        seen.add(card.oracle_id);
        out.push({ card, synergy: s.synergy, numDecks: s.numDecks });
      }
      setEdhrecRows(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "EDHREC lookup failed.");
      setEdhrecRows([]);
    } finally {
      setLoading(false);
    }
  }, [deck.commanders]);

  // Otag source auto-runs when opened from a skeleton row.
  useEffect(() => {
    if (initialOtag) void runOtag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // EDHREC: fetch once when the source is first selected.
  useEffect(() => {
    if (source === "edhrec" && edhrecRows === null && !loading) void loadEdhrec();
  }, [source, edhrecRows, loading, loadEdhrec]);

  const activeSort = source === "edhrec" ? edhrecSortValue : sort;

  // The rendered list: filtered + sorted the same way every card list is.
  const visible = useMemo(() => {
    const base =
      source === "otag"
        ? (rows ?? [])
        : (edhrecRows ?? [])
            .filter((r) => !deckOracles.main.has(r.card.oracle_id))
            .filter((r) => passesFilters(r.card))
            .map((r) =>
              scope === "collection"
                ? { ...r, card: ownedMap.get(r.card.oracle_id)?.card ?? r.card }
                : r,
            );
    const list = [...base];
    if (activeSort === "synergy") {
      list.sort((a, b) => (b.synergy ?? -1) - (a.synergy ?? -1));
    } else if (activeSort === "popularity") {
      list.sort((a, b) => (b.numDecks ?? 0) - (a.numDecks ?? 0));
    } else {
      const cmpCards = cardComparator(activeSort as CardSort, (c) => priceOf(c, "nonfoil") ?? 0);
      list.sort((a, b) => cmpCards(a.card, b.card));
    }
    return list;
  }, [source, rows, edhrecRows, deckOracles, passesFilters, activeSort, scope, ownedMap, priceVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const addToDeck = (card: ScryCard) => {
    update((d) => {
      const existing = d.entries.find((e) => e.card.oracle_id === card.oracle_id);
      if (existing) {
        // Promote from a board: drop board categories, keep the rest.
        existing.categories = existing.categories.filter((c) => !isBoardCategory(c));
        if (initialCategory && !existing.categories.includes(initialCategory)) {
          existing.categories = [initialCategory, ...existing.categories];
        }
      } else {
        d.entries.push({
          card,
          quantity: 1,
          isCommander: false,
          categories: initialCategory ? [initialCategory] : [],
          addedAt: Date.now(),
        });
      }
    });
  };

  const addToMaybe = (card: ScryCard) => {
    update((d) => {
      const existing = d.entries.find((e) => e.card.oracle_id === card.oracle_id);
      if (existing) {
        if (!existing.categories.includes("Maybeboard"))
          existing.categories = ["Maybeboard", ...existing.categories];
      } else {
        d.entries.push({
          card,
          quantity: 1,
          isCommander: false,
          categories: ["Maybeboard"],
          addedAt: Date.now(),
        });
      }
      if (d.categorySettings?.["Maybeboard"] === undefined) {
        d.categorySettings = {
          ...d.categorySettings,
          Maybeboard: { inDeck: false, inPrice: false },
        };
      }
    });
  };

  return (
    <ModalShell
      onClose={onClose}
      size="2xl"
      anchor="top"
      title={
        <span className="flex items-center gap-2">
          <Lightbulb size={15} className="text-amber-300" />
          Suggestions
          {initialCategory && (
            <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              adds go to “{initialCategory}”
            </span>
          )}
        </span>
      }
    >
      {/* Source / sort / scope */}
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          value={source}
          onChange={setSource}
          options={[
            { value: "otag", label: "Otags", title: "Scryfall oracle tags + filters" },
            {
              value: "edhrec",
              label: "EDHREC",
              title: "Commander-page suggestions, synergy-sorted",
            },
          ]}
        />
        <SortSelect
          compact
          value={activeSort}
          onChange={(s) => (source === "edhrec" ? setEdhrecSortValue(s) : setSort(s))}
          extra={source === "edhrec" ? EDHREC_SORTS : undefined}
        />
        <div className="ml-auto">
          <Seg
            value={scope}
            onChange={setScope}
            options={[
              {
                value: "collection",
                label: (
                  <>
                    <Backpack size={11} className="inline align-[-1px]" /> Collection
                  </>
                ),
                accent: "emerald",
                title: "Only cards you own",
              },
              { value: "all", label: "All cards" },
            ]}
          />
        </div>
      </div>

      {/* Otag chips */}
      {source === "otag" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
            Tags
          </span>
          {OTAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggle(otags, setOtags, tag)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                otags.includes(tag)
                  ? "bg-emerald-700 text-white"
                  : "bg-stone-900 text-stone-500 hover:text-stone-200"
              }`}
            >
              {tag}
            </button>
          ))}
          <input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runOtag()}
            placeholder="custom tag…"
            className="w-24 rounded-md border border-stone-700 bg-stone-900 px-2 py-0.5 text-[10px] outline-none focus:border-emerald-600"
          />
        </div>
      )}

      {/* Shared filters */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
            Type
          </span>
          <TypeChips selected={types} onToggle={(t) => toggle(types, setTypes, t)} types={SUGGEST_TYPES} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
            Color
          </span>
          <ColorPicker
            selected={colors}
            onToggle={(c) => toggle(colors, setColors, c)}
            colors={identity.length > 0 ? identity : ["W", "U", "B", "R", "G"]}
            size={4}
          />
        </div>
        <NumberFilter
          inline
          label="Mana value"
          op={mvOp}
          value={mv}
          onOp={setMvOp}
          onValue={setMv}
          onSubmit={() => source === "otag" && void runOtag()}
        />
        <RarityChips selected={rarities} onToggle={(r) => toggle(rarities, setRarities, r)} />
        {source === "otag" && (
          <button
            onClick={() => void runOtag()}
            disabled={loading}
            className="ml-auto rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[10px] text-stone-600">
        Commander identity ({identity.join("") || "C"}) is always applied.
        {source === "edhrec"
          ? " Synergy = how much more often a card shows up with this commander than everywhere else — high synergy is where the non-generic tech hides."
          : " Combine tags and types: “Creature” + “ramp” finds creatures that ramp."}
      </p>

      {/* Results */}
      <div className="mt-3">
        {error && <p className="py-4 text-center text-xs text-amber-400">{error}</p>}
        {loading && !error && (
          <p className="py-8 text-center text-xs text-stone-600">
            {source === "edhrec" ? "Fetching + resolving EDHREC suggestions…" : "Searching…"}
          </p>
        )}
        {!loading && !error && visible.length === 0 && source === "otag" && rows === null && (
          <p className="py-8 text-center text-xs text-stone-600">
            Pick tags/filters and hit Search.
          </p>
        )}
        {visible.length > 0 && (
          <>
            <p className="mb-2 text-[11px] text-stone-500">
              {visible.length} suggestion{visible.length === 1 ? "" : "s"} — cards already in the
              deck are hidden; click a card for details.
            </p>
            <div className={`${CARD_GRID} max-h-[60vh] overflow-y-auto`}>
              {visible.map((r) => {
                const inMaybe = deckOracles.maybe.has(r.card.oracle_id);
                const owned = ownedMap.get(r.card.oracle_id);
                return (
                  <PrintingTile
                    key={r.card.oracle_id}
                    card={r.card}
                    ownedNonfoil={owned?.nonfoil ?? 0}
                    ownedFoil={owned?.foil ?? 0}
                    showName
                    showSetInfo={false}
                    dimUnowned={false}
                    onOpen={() => onOpenCard(r.card)}
                    badge={
                      r.synergy !== undefined ? (
                        <span
                          className="flex items-center gap-0.5 rounded bg-black/80 px-1 text-[9px] font-bold text-emerald-300"
                          title="EDHREC synergy with this commander"
                        >
                          <TrendingUp size={9} />
                          {Math.round(r.synergy * 100)}%
                        </span>
                      ) : undefined
                    }
                    footer={
                      <div className="flex gap-1">
                        <button
                          onClick={() => addToDeck(r.card)}
                          className="flex-1 rounded bg-emerald-700 px-1 py-1 text-[11px] font-bold text-white hover:bg-emerald-600"
                          title={inMaybe ? "Promote from Maybeboard into the deck" : "Add to the deck"}
                        >
                          + Deck
                        </button>
                        {inMaybe ? (
                          <span className="flex flex-1 items-center justify-center gap-0.5 rounded bg-stone-800 px-1 py-1 text-[11px] font-semibold text-stone-500">
                            <Check size={10} /> Maybe
                          </span>
                        ) : (
                          <button
                            onClick={() => addToMaybe(r.card)}
                            className="flex-1 rounded bg-stone-800 px-1 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700"
                          >
                            Maybe
                          </button>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

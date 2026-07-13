"use client";

import { Backpack, Layers, Lightbulb, List, Play, Search, X } from "lucide-react";
import {
  Fragment,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { CategorySetting, Deck, ScryCard } from "@/types";
import { includedEntries, isBoardCategory } from "@/types";
import { getRepo, type VersionChange } from "@/lib/repo";
import {
  computeDeckStats,
  groupEntriesByLens,
  typeGroup,
  type GroupLens,
  type LensEntry,
} from "@/lib/deck/stats";
import { snapshotOf } from "@/lib/deck/versions";
import { getCardDbStatus } from "@/lib/cards/carddb";
import { ownedOracleIds } from "@/lib/cards/collection";
import {
  getSearchScope,
  preferOwnedPrinting,
  setSearchScope,
  smartSearch,
  type SearchScope,
} from "@/lib/cards/smartSearch";
import { saveBotDecks, saveCurrentDeck } from "@/lib/deck/storage";
import { useGameStore } from "@/lib/game/store";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";
import { CardSearchModal } from "@/components/builder/CardSearchModal";
import { CardDetailModal } from "@/components/builder/CardDetailModal";
import { DeckDock } from "@/components/builder/DeckDock";
import { CardRow, DropHint } from "@/components/builder/CardRows";
import { SuggestionsModal } from "@/components/builder/SuggestionsModal";
import { ModalShell } from "@/components/ui/ModalShell";
import { useCardMinPx } from "@/components/ui/CardSizeSelect";
import { Seg } from "@/components/ui/Seg";
import { CATEGORY_OTAG } from "@/lib/cards/otags";

type ViewMode = "stacks" | "text";
const VIEW_KEY = "edh-playtest:builder-view";
const LENS_KEY = "edh-playtest:builder-lens";
const COMMANDER_DROP = "cat:__commander__";
/** Lenses whose columns are category drop targets. */
const DROPPABLE_LENSES: GroupLens[] = ["category", "category-all"];

const LENS_LABEL: Record<GroupLens, string> = {
  category: "Category",
  "category-all": "Category (all)",
  type: "Type",
  curve: "Curve",
  color: "Color",
};

/** Diff two decks by card name for the auto changelog entry. */
function diffDecks(before: Deck, after: Deck): { adds: VersionChange[]; cuts: VersionChange[] } {
  const count = (d: Deck) => {
    const m = new Map<string, number>();
    for (const e of d.entries) m.set(e.card.name, (m.get(e.card.name) ?? 0) + e.quantity);
    for (const c of d.commanders) m.set(c.name, (m.get(c.name) ?? 0) + 1);
    return m;
  };
  const a = count(before);
  const b = count(after);
  const adds: VersionChange[] = [];
  const cuts: VersionChange[] = [];
  for (const [name, qty] of b) {
    const prev = a.get(name) ?? 0;
    if (qty > prev) adds.push({ name: qty - prev > 1 ? `${qty - prev}x ${name}` : name });
  }
  for (const [name, qty] of a) {
    const next = b.get(name) ?? 0;
    if (next < qty) cuts.push({ name: qty - next > 1 ? `${qty - next}x ${name}` : name });
  }
  return { adds, cuts };
}

function CategoryColumn({
  name,
  dropId,
  entries,
  setting,
  viewMode,
  accent,
  ownedIds,
  dragging,
  altHeld,
  selection,
  onOpen,
  onToggleSelect,
  onToggleSetting,
}: {
  name: string;
  /** `cat:X` = real drop target; `noop:X` = display-only (type/curve/color lens). */
  dropId: string;
  entries: LensEntry[];
  setting: CategorySetting | undefined;
  viewMode: ViewMode;
  accent?: "commander";
  ownedIds: Set<string>;
  /** A drag is in progress — show the column as a labelled drop target. */
  dragging?: boolean;
  /** Alt is held during the drag — dropping adds a category instead of moving. */
  altHeld?: boolean;
  selection: Set<string>;
  onOpen: (card: ScryCard) => void;
  onToggleSelect: (cardId: string) => void;
  onToggleSetting?: (key: keyof CategorySetting) => void;
}) {
  const droppable = dropId.startsWith("cat:");
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: !droppable });
  const solid = entries.filter((e) => !e.ghost);
  const ghosts = entries.length - solid.length;
  const count = solid.reduce((n, e) => n + e.entry.quantity, 0);
  const inDeck = setting?.inDeck !== false;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col rounded-lg border p-2 transition-colors ${
        isOver && droppable
          ? "border-emerald-600/70 bg-emerald-950/20"
          : accent === "commander"
            ? "border-amber-800/50 bg-amber-950/10"
            : inDeck
              ? "border-stone-800 bg-stone-950"
              : "border-stone-800 bg-stone-950/50 opacity-80"
      }`}
    >
      {/* Archidekt-style drop target: grey veil + category name while dragging. */}
      {dragging && droppable && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg px-2 text-center transition ${
            isOver
              ? altHeld
                ? "bg-sky-600/35 text-sky-50 ring-2 ring-sky-500"
                : "bg-emerald-600/35 text-emerald-50 ring-2 ring-emerald-500"
              : "bg-stone-950/55 text-stone-300 ring-1 ring-stone-700"
          }`}
        >
          <span className="text-sm font-bold tracking-wide uppercase">{name}</span>
          {isOver && accent !== "commander" && (
            <span className="mt-0.5 text-[10px] font-semibold opacity-90">
              {altHeld ? "+ add as extra category" : "move here"}
            </span>
          )}
        </div>
      )}
      <div className="relative mb-1.5 flex items-center justify-between px-1">
        <span
          className={`truncate text-xs font-bold ${accent === "commander" ? "text-amber-400" : "text-emerald-500"}`}
        >
          {name}{" "}
          <span className="font-normal text-stone-600">
            ({count}
            {ghosts > 0 ? <span className="text-stone-700"> +{ghosts}</span> : null})
          </span>
        </span>
        <div className="flex items-center gap-1">
          {!inDeck && accent !== "commander" && (
            <span className="rounded bg-stone-800 px-1 text-[8px] font-bold tracking-wide text-stone-500 uppercase">
              not in deck
            </span>
          )}
          {onToggleSetting && (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded px-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
            >
              ⋮
            </button>
          )}
        </div>
        {menuOpen && onToggleSetting && (
          <div className="absolute top-6 right-0 z-40 w-48 rounded-lg border border-stone-700 bg-stone-900 py-1 shadow-2xl">
            <button
              onClick={() => {
                onToggleSetting("inDeck");
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-[11px] text-stone-200 hover:bg-stone-800"
            >
              {inDeck ? "Exclude from deck (sideboard)" : "Include in deck"}
            </button>
            <button
              onClick={() => {
                onToggleSetting("inPrice");
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-[11px] text-stone-200 hover:bg-stone-800"
            >
              {setting?.inPrice !== false ? "Exclude from price" : "Include in price"}
            </button>
          </div>
        )}
      </div>

      <div className={`flex min-h-8 flex-col ${viewMode === "text" ? "gap-0.5" : ""}`}>
        {entries.map((le) => (
          <CardRow
            key={`${le.ghost ? "g:" : ""}${le.entry.card.id}`}
            view={viewMode}
            le={le}
            owned={ownedIds.has(le.entry.card.oracle_id)}
            selected={selection.has(le.entry.card.id) && !le.ghost}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
          />
        ))}
        {entries.length === 0 && <DropHint />}
      </div>
    </div>
  );
}

/** One quick-search result — a drag source and a click-to-open row. */
function DropdownRow({
  card,
  owned,
  highlighted,
  onOpen,
}: {
  card: ScryCard;
  owned: boolean;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `search:${card.id}`,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={`flex w-full cursor-grab items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
        highlighted ? "bg-stone-800 text-white" : "text-stone-200 hover:bg-stone-800"
      }`}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      {owned && <Backpack size={12} className="shrink-0 text-emerald-400" aria-label="In your collection" />}
      <span className="min-w-0 flex-1 truncate">{card.name}</span>
      <ManaCost cost={card.mana_cost} size={11} />
      <span className="w-32 shrink-0 truncate text-right text-[10px] text-stone-600">
        {card.type_line}
      </span>
    </button>
  );
}

export default function DeckEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [original, setOriginal] = useState<Deck | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [detailCard, setDetailCard] = useState<ScryCard | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("stacks");
  const [lens, setLens] = useState<GroupLens>("category");
  const [scope, setScope] = useState<SearchScope>("collection");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryCard[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [searchModal, setSearchModal] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<{ otag?: string; category?: string } | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragCard, setDragCard] = useState<ScryCard | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [dockNote, setDockNote] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const resultsRef = useRef<ScryCard[]>([]);
  const omniboxRef = useRef<HTMLInputElement>(null);

  // Masonry column count, derived from the deck area's width. Column width
  // follows the global card size (header dropdown), so bigger cards = fewer,
  // wider columns. The playtest table has its own sizing and is untouched.
  const cardMinPx = useCardMinPx();
  const [deckCols, setDeckCols] = useState(4);
  const colObserver = useRef<ResizeObserver | null>(null);
  const measureDeckCols = useCallback(
    (el: HTMLElement | null) => {
      colObserver.current?.disconnect();
      colObserver.current = null;
      if (!el) return;
      const GAP = 12; // gap-3
      const MIN_COL = cardMinPx + 16; // card + column padding
      const apply = () =>
        setDeckCols(Math.max(1, Math.floor((el.clientWidth + GAP) / (MIN_COL + GAP))));
      apply();
      colObserver.current = new ResizeObserver(apply);
      colObserver.current.observe(el);
    },
    [cardMinPx],
  );

  useEffect(() => {
    void ownedOracleIds().then(setOwnedIds);
  }, []);

  useEffect(() => {
    try {
      const savedView = window.localStorage.getItem(VIEW_KEY);
      if (savedView === "text" || savedView === "stacks") setViewMode(savedView);
      const savedLens = window.localStorage.getItem(LENS_KEY) as GroupLens | null;
      if (savedLens && savedLens in LENS_LABEL) setLens(savedLens);
    } catch {
      // ignore
    }
    setScope(getSearchScope());
    void getRepo()
      .getDeck(id)
      .then((d) => {
        if (d) {
          setOriginal(structuredClone(d.deck));
          setDraft(structuredClone(d.deck));
        } else {
          setOriginal(null);
          setDraft(null);
        }
      });
  }, [id]);

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // ignore
    }
  };

  const setLensPersist = (l: GroupLens) => {
    setLens(l);
    try {
      window.localStorage.setItem(LENS_KEY, l);
    } catch {
      // ignore
    }
  };

  const changeScope = (s: SearchScope) => {
    setScope(s);
    setSearchScope(s);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dirty = useMemo(
    () => original && draft && JSON.stringify(original) !== JSON.stringify(draft),
    [original, draft],
  );

  const stats = useMemo(() => (draft ? computeDeckStats(draft) : null), [draft]);
  const lensGroups = useMemo(() => (draft ? groupEntriesByLens(draft, lens) : []), [draft, lens]);

  const commanderEntries = useMemo(
    () => draft?.entries.filter((e) => e.isCommander) ?? [],
    [draft],
  );
  const deckCount = useMemo(() => {
    if (!draft) return 0;
    return (
      includedEntries(draft).reduce((n, e) => n + (e.isCommander ? 0 : e.quantity), 0) +
      draft.commanders.length
    );
  }, [draft]);

  const update = (fn: (d: Deck) => void) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  // Debounced quick-search dropdown (collection-first).
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setResults([]);
      setHighlight(-1);
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      void smartSearch(query, scope, 9).then((cards) => {
        setResults(cards);
        setHighlight(-1);
      });
    }, 250);
  }, [query, scope]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // "/" focuses the omnibox from anywhere (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      omniboxRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track Alt during a drag: alt-drop adds a category instead of moving.
  useEffect(() => {
    if (!dragCard) return;
    const down = (e: KeyboardEvent) => e.key === "Alt" && setAltHeld(true);
    const up = (e: KeyboardEvent) => e.key === "Alt" && setAltHeld(false);
    const move = (e: PointerEvent) => setAltHeld(e.altKey);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointermove", move);
    };
  }, [dragCard]);

  /** Open the card modal; Collection scope shows the printing you own. */
  const openCard = async (card: ScryCard) => {
    const inDeck = draft?.entries.some((e) => e.card.oracle_id === card.oracle_id);
    const resolved = !inDeck && scope === "collection" ? await preferOwnedPrinting(card) : card;
    setDetailCard(resolved);
  };

  /** Add a search result to the deck via drop/keyboard, honoring scope. */
  const addFromSearch = async (card: ScryCard, overId: string) => {
    const resolved = scope === "collection" ? await preferOwnedPrinting(card) : card;
    update((d) => {
      const existing = d.entries.find((x) => x.card.oracle_id === resolved.oracle_id);
      if (overId === COMMANDER_DROP) {
        if (existing) {
          existing.isCommander = true;
        } else {
          d.entries.push({
            card: resolved,
            quantity: 1,
            isCommander: true,
            categories: [],
            addedAt: Date.now(),
          });
        }
        d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
        d.colorIdentity = [...new Set(d.commanders.flatMap((c) => c.color_identity))];
        return;
      }
      const category = overId.slice(4);
      const isType = category === typeGroup(resolved);
      if (existing) {
        if (!isType && !existing.categories.includes(category)) {
          existing.categories = [category, ...existing.categories];
        }
      } else {
        d.entries.push({
          card: resolved,
          quantity: 1,
          isCommander: false,
          categories: isType ? [] : [category],
          addedAt: Date.now(),
        });
      }
      if (!isType && d.categorySettings?.[category] === undefined && isBoardCategory(category)) {
        d.categorySettings = { ...d.categorySettings, [category]: { inDeck: false, inPrice: false } };
      }
    });
  };

  if (draft === null || stats === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#08080a] text-sm text-stone-500">
        {original === null ? "Deck not found." : "Loading…"}
      </div>
    );
  }

  const onDragStart = (e: DragStartEvent) => {
    const activeId = String(e.active.id);
    if (activeId.startsWith("search:")) {
      const card = resultsRef.current.find((c) => `search:${c.id}` === activeId);
      setDragCard(card ?? null);
      return;
    }
    const entry = draft.entries.find((x) => x.card.id === activeId);
    setDragCard(entry?.card ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const alt = altHeld;
    setDragCard(null);
    setAltHeld(false);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId?.startsWith("cat:")) return;
    const activeId = String(e.active.id);

    // From the quick-search dropdown: add the card where it was dropped.
    if (activeId.startsWith("search:")) {
      const card = resultsRef.current.find((c) => `search:${c.id}` === activeId);
      if (card) void addFromSearch(card, overId);
      return;
    }

    // Multi-select: dragging a selected card moves the whole selection.
    const ids = selection.has(activeId) && overId !== COMMANDER_DROP ? [...selection] : [activeId];

    if (overId === COMMANDER_DROP) {
      update((d) => {
        const entry = d.entries.find((x) => x.card.id === activeId);
        if (!entry) return;
        entry.isCommander = true;
        d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
        d.colorIdentity = [...new Set(d.commanders.flatMap((c) => c.color_identity))];
      });
      setSelection(new Set());
      return;
    }

    const category = overId.slice(4);
    update((d) => {
      for (const cardId of ids) {
        const entry = d.entries.find((x) => x.card.id === cardId);
        if (!entry) continue;
        // Moving out of the commander column happens by dropping elsewhere.
        if (entry.isCommander && !alt) {
          entry.isCommander = false;
          d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
          d.colorIdentity = [...new Set(d.commanders.flatMap((c) => c.color_identity))];
        }
        const isTypeGroup = category === typeGroup(entry.card);
        if (alt) {
          // Alt-drop: append as a secondary category, keep the premier one.
          if (!isTypeGroup && !entry.categories.includes(category)) {
            entry.categories = [...entry.categories, category];
          }
        } else if (isTypeGroup) {
          // Dropping on its own type column demotes the premier category only
          // (secondary categories survive — they're data, not layout).
          entry.categories = entry.categories.slice(1);
        } else {
          entry.categories = [category, ...entry.categories.filter((c) => c !== category)];
        }
        if (
          !isTypeGroup &&
          d.categorySettings?.[category] === undefined &&
          isBoardCategory(category)
        ) {
          d.categorySettings = {
            ...d.categorySettings,
            [category]: { inDeck: false, inPrice: false },
          };
        }
      }
    });
    setSelection(new Set());
  };

  const toggleSetting = (name: string, key: keyof CategorySetting) => {
    update((d) => {
      const current: CategorySetting = d.categorySettings?.[name] ?? { inDeck: true, inPrice: true };
      d.categorySettings = { ...d.categorySettings, [name]: { ...current, [key]: !current[key] } };
    });
  };

  const toggleSelect = (cardId: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  /** Load the current draft straight into the playtester (solo, unsaved-OK). */
  const playtest = () => {
    if (!draft) return;
    saveCurrentDeck(draft);
    saveBotDecks([]);
    useGameStore.getState().loadDeck(draft);
    useGameStore.getState().loadBotDecks([]);
    router.push("/play");
  };

  const save = async (withChangelog: boolean) => {
    if (!draft || !original) return;
    setSaving(true);
    try {
      const repo = getRepo();
      await repo.saveDeck(draft);
      if (withChangelog) {
        const { adds, cuts } = diffDecks(original, draft);
        if (adds.length > 0 || cuts.length > 0 || saveTitle.trim()) {
          await repo.addVersion({
            deckId: draft.id,
            date: Date.now(),
            title: saveTitle.trim() || `Update — ${new Date().toLocaleDateString()}`,
            adds,
            cuts,
            snapshot: snapshotOf(draft),
          });
        }
      }
      router.push(`/d/${draft.id}`);
    } finally {
      setSaving(false);
    }
  };

  const onOmniboxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Escape") {
      setResults([]);
      setHighlight(-1);
    } else if (e.key === "Enter") {
      const picked = highlight >= 0 ? results[highlight] : undefined;
      if (picked && e.shiftKey) {
        // Shift+Enter: quick-add (no category — lands in its type column).
        void addFromSearch(picked, `cat:${typeGroup(picked)}`);
      } else if (picked && e.altKey) {
        void addFromSearch(picked, "cat:Maybeboard");
      } else if (picked) {
        void openCard(picked);
      } else {
        setSearchModal(query);
        setResults([]);
      }
    }
  };

  const diff = original ? diffDecks(original, draft) : { adds: [], cuts: [] };
  const cardDb = getCardDbStatus();
  const commanderArt =
    draft.commanders[0]?.image_uris?.art_crop ??
    draft.commanders[0]?.card_faces?.[0]?.image_uris?.art_crop;
  const ringColor =
    deckCount === 100 ? "#34d399" : deckCount > 100 ? "#fb7185" : "#fbbf24";
  const ringDash = 2 * Math.PI * 15;
  const showCommanderColumn = commanderEntries.length > 0 || dragCard !== null;
  const droppableLens = DROPPABLE_LENSES.includes(lens);

  // Masonry packing: build the columns (Commander first), then greedily place
  // each into the shortest column. Columns are equal-width and flex-fill, so
  // short categories stack under taller ones instead of leaving the big vertical
  // gaps a plain grid creates (every grid row is as tall as its tallest cell).
  const deckItems: { key: string; weight: number; node: ReactNode }[] = [];
  if (showCommanderColumn) {
    deckItems.push({
      key: "__commander",
      weight: 2 + commanderEntries.length,
      node: (
        <CategoryColumn
          name="Commander"
          dropId={COMMANDER_DROP}
          entries={commanderEntries.map((entry) => ({ entry, ghost: false }))}
          setting={undefined}
          viewMode={viewMode}
          ownedIds={ownedIds}
          dragging={dragCard !== null}
          altHeld={altHeld}
          selection={selection}
          accent="commander"
          onOpen={(c) => void openCard(c)}
          onToggleSelect={toggleSelect}
        />
      ),
    });
  }
  for (const { group, entries } of lensGroups) {
    deckItems.push({
      key: `${lens}:${group}`,
      weight: 2 + entries.length,
      node: (
        <CategoryColumn
          name={group}
          dropId={droppableLens ? `cat:${group}` : `noop:${group}`}
          entries={entries}
          setting={draft.categorySettings?.[group]}
          viewMode={viewMode}
          ownedIds={ownedIds}
          dragging={dragCard !== null}
          altHeld={altHeld}
          selection={selection}
          onOpen={(c) => void openCard(c)}
          onToggleSelect={toggleSelect}
          onToggleSetting={
            droppableLens ? (key) => toggleSetting(group, key) : undefined
          }
        />
      ),
    });
  }
  const colCount = Math.max(1, Math.min(deckCols, deckItems.length || 1));
  const deckBuckets: { key: string; node: ReactNode }[][] = Array.from(
    { length: colCount },
    () => [],
  );
  const colHeights = new Array(colCount).fill(0);
  for (const item of deckItems) {
    let shortest = 0;
    for (let i = 1; i < colCount; i++) if (colHeights[i] < colHeights[shortest]) shortest = i;
    deckBuckets[shortest]!.push({ key: item.key, node: item.node });
    colHeights[shortest] += item.weight;
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-dvh flex-col bg-[#08080a] text-stone-200">
        {/* ── Tier 1: identity strip ─────────────────────────────────────── */}
        <header className="flex items-center gap-3 border-b border-stone-800 bg-gradient-to-b from-stone-950 to-[#0a0a0c] px-3 py-2">
          <Link
            href={`/d/${id}`}
            className="shrink-0 text-xs text-stone-500 hover:text-stone-200"
            title="Back to the showcase"
          >
            ←
          </Link>
          {commanderArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={commanderArt}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg border border-stone-700 object-cover"
            />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-lg border border-stone-800 bg-stone-900" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={draft.name}
                onChange={(e) => update((d) => void (d.name = e.target.value))}
                className="w-56 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-bold outline-none hover:border-stone-800 focus:border-emerald-600 focus:bg-stone-900"
              />
              <span className="flex gap-0.5">
                {draft.colorIdentity.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={c} src={`/mana/${c}.svg`} alt={c} className="h-4 w-4" />
                ))}
              </span>
              <select
                value={draft.bracket ?? 0}
                onChange={(e) =>
                  update((d) => void (d.bracket = parseInt(e.target.value, 10) || undefined))
                }
                className="cursor-pointer appearance-none rounded-full border border-stone-800 bg-stone-950 px-2 py-0.5 font-mono text-[10px] text-stone-400 outline-none hover:border-stone-600 focus:border-emerald-600"
                title="Commander bracket — pick one, or leave on auto for the guess"
              >
                <option value={0}>B{stats.bracketGuess}~ auto</option>
                {[1, 2, 3, 4, 5].map((b) => (
                  <option key={b} value={b}>
                    Bracket {b}
                  </option>
                ))}
              </select>
              {stats.priceUsd !== null && (
                <span className="rounded-full border border-stone-800 bg-stone-950 px-2 py-0.5 font-mono text-[10px] text-stone-400">
                  ${stats.priceUsd.toFixed(0)}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="shrink-0 font-bold text-emerald-600">“</span>
              <input
                value={draft.pitch ?? ""}
                onChange={(e) => update((d) => void (d.pitch = e.target.value))}
                placeholder="Write the pitch — one sentence on what this deck does and how it wins…"
                className="w-full max-w-2xl rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-stone-300 italic outline-none placeholder:text-stone-600 hover:border-stone-800 focus:border-emerald-600 focus:bg-stone-900"
                title="The deck's thesis — keep it in view while you cut and add"
              />
              <span className="shrink-0 font-bold text-emerald-600">”</span>
            </div>
          </div>

          {/* Count ring */}
          <div className="flex shrink-0 items-center gap-1.5" title={`${deckCount} of 100 cards (incl. commander)`}>
            <svg width="38" height="38" viewBox="0 0 38 38">
              <circle cx="19" cy="19" r="15" fill="none" stroke="#292524" strokeWidth="3.5" />
              <circle
                cx="19"
                cy="19"
                r="15"
                fill="none"
                stroke={ringColor}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={ringDash}
                strokeDashoffset={ringDash * (1 - Math.min(1, deckCount / 100))}
                transform="rotate(-90 19 19)"
              />
              <text
                x="19"
                y="23"
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#e7e5e4"
              >
                {deckCount}
              </text>
            </svg>
            <span className="font-mono text-[9px] leading-tight text-stone-500">
              of 100
              <br />
              <span className={deckCount === 100 ? "text-emerald-400" : deckCount > 100 ? "text-rose-400" : "text-amber-400"}>
                {deckCount === 100 ? "legal ✓" : deckCount > 100 ? `${deckCount - 100} over` : `${100 - deckCount} to go`}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {dirty && <span className="text-[10px] font-bold text-amber-400">● unsaved</span>}
            <button
              onClick={playtest}
              className="rounded-md border border-sky-800/60 bg-sky-950/40 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-900/50"
              title="Playtest the current deck (includes unsaved changes)"
            >
              <Play size={12} className="inline align-[-2px]" /> Playtest
            </button>
            <button
              onClick={() => {
                setDraft(structuredClone(original));
                setDetailCard(null);
                setSelection(new Set());
              }}
              disabled={!dirty}
              className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              onClick={() => {
                setSaveTitle("");
                setSaveOpen(true);
              }}
              disabled={!dirty}
              className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              Save…
            </button>
          </div>
        </header>

        {/* ── Tier 2: workbench toolbar ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-800 bg-stone-950/80 px-3 py-1.5">
          {/* Search scope */}
          <Seg
            value={scope}
            onChange={changeScope}
            options={[
              {
                value: "collection",
                label: (
                  <>
                    <Backpack size={12} className="inline align-[-2px]" /> Collection
                  </>
                ),
                accent: "emerald",
                title: "Build from what you own first",
              },
              { value: "all", label: "All cards", title: "Search everything" },
            ]}
          />

          {/* Omnibox + dropdown */}
          <div className="relative min-w-64 flex-1">
            <input
              ref={omniboxRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onOmniboxKeyDown}
              placeholder={
                scope === "collection"
                  ? "Add from your collection — otag:, o:, t: work too… ( / )"
                  : cardDb.syncedAt
                    ? "Add a card — name, otag:, o:, t:… ( / )"
                    : "Add a card (Scryfall) — Enter for full search… ( / )"
              }
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
            />
            {results.length > 0 && (
              <div className="absolute top-9 right-0 left-0 z-40 max-h-96 overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 shadow-2xl">
                {scope === "collection" && (
                  <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold tracking-widest text-emerald-500 uppercase">
                    In your collection
                  </div>
                )}
                {results.map((card, i) => (
                  <DropdownRow
                    key={card.id}
                    card={card}
                    owned={ownedIds.has(card.oracle_id)}
                    highlighted={i === highlight}
                    onOpen={() => {
                      void openCard(card);
                      setResults([]);
                      setQuery("");
                    }}
                  />
                ))}
                <button
                  onClick={() => {
                    setSearchModal(query);
                    setResults([]);
                  }}
                  className="block w-full border-t border-stone-800 px-3 py-1.5 text-left text-[11px] font-semibold text-sky-400 hover:bg-stone-800"
                >
                  ⏎ Full search for “{query}”…
                </button>
                <div className="border-t border-stone-800 px-3 py-1 font-mono text-[9px] text-stone-600">
                  drag onto a column · ↑↓ pick · ↵ open · ⇧↵ add · ⌥↵ maybeboard
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setSearchModal(query)}
            className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
          >
            <Search size={13} className="inline align-[-2px]" /> Advanced
          </button>
          <button
            onClick={() => setSuggest({})}
            className="rounded-md border border-amber-800/50 bg-amber-950/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/30"
            title="Discover cards via oracle tags or EDHREC synergy"
          >
            <Lightbulb size={13} className="inline align-[-2px]" /> Suggestions
          </button>
          <button
            onClick={() => setBrowseOpen(true)}
            className="rounded-md border border-emerald-800/50 bg-emerald-950/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/30"
            title="Everything you own that fits the commander's color identity"
          >
            <Backpack size={13} className="inline align-[-2px]" /> Browse collection
          </button>

          {/* Group lens */}
          <span className="ml-1 font-mono text-[9px] tracking-widest text-stone-600 uppercase">
            Group
          </span>
          <Seg
            value={lens}
            onChange={setLensPersist}
            options={(Object.keys(LENS_LABEL) as GroupLens[]).map((l) => ({
              value: l,
              label: LENS_LABEL[l],
              title:
                l === "category-all"
                  ? "Show cards in every category they hold — ghosted outside their premier column"
                  : undefined,
            }))}
          />

          {/* View toggle */}
          <span className="font-mono text-[9px] tracking-widest text-stone-600 uppercase">
            View
          </span>
          <Seg
            value={viewMode}
            onChange={setView}
            options={[
              {
                value: "stacks",
                label: (
                  <>
                    <Layers size={12} className="inline align-[-2px]" /> Stacks
                  </>
                ),
              },
              {
                value: "text",
                label: (
                  <>
                    <List size={12} className="inline align-[-2px]" /> Text
                  </>
                ),
              },
            ]}
          />

          {selection.size > 0 && (
            <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              {selection.size} selected — drag any of them to move all ·{" "}
              <button onClick={() => setSelection(new Set())} className="underline">
                clear
              </button>
            </span>
          )}
        </div>

        {/* ── Body: columns + dock ───────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          <main
            ref={measureDeckCols}
            className="flex flex-1 items-start gap-3 overflow-y-auto p-3"
          >
            {deckBuckets.map((bucket, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-3" style={{ maxWidth: cardMinPx + 90 }}>
                {bucket.map((item) => (
                  <Fragment key={item.key}>{item.node}</Fragment>
                ))}
              </div>
            ))}
          </main>

          <DeckDock
            deck={draft}
            update={update}
            stats={stats}
            ownedIds={ownedIds}
            dragging={dragCard !== null}
            viewMode={viewMode}
            selection={selection}
            onToggleSelect={toggleSelect}
            onOpenCard={(c) => void openCard(c)}
            onReplaceDraft={(restored, note) => {
              setDraft(restored);
              setDockNote(note);
            }}
            onSuggest={(category) =>
              setSuggest({
                otag: CATEGORY_OTAG[category.toLowerCase()],
                category: category.toLowerCase() === "lands" ? undefined : category,
              })
            }
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragCard && (
          <div className="relative w-24 rotate-3">
            <CardImage card={dragCard} className="w-full rounded shadow-2xl shadow-black" />
            {selection.size > 1 && selection.has(dragCard.id) && (
              <span className="absolute -top-2 -right-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                +{selection.size - 1}
              </span>
            )}
            {altHeld && (
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-sky-700 px-1.5 text-[9px] font-bold whitespace-nowrap text-white shadow">
                + category
              </span>
            )}
          </div>
        )}
      </DragOverlay>

      {/* Restore note (from History) */}
      {dockNote && (
        <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-emerald-800 bg-stone-950 px-4 py-2 text-xs text-emerald-300 shadow-2xl">
          {dockNote}
          <button onClick={() => setDockNote(null)} className="ml-3 text-stone-500 hover:text-stone-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Card detail modal (from columns, dock, or quick-search) */}
      {detailCard && (
        <CardDetailModal
          card={detailCard}
          deck={draft}
          update={update}
          onClose={() => setDetailCard(null)}
          onNavigate={setDetailCard}
        />
      )}

      {/* Full search modal — opens card detail on click */}
      {searchModal !== null && (
        <CardSearchModal
          initialQuery={searchModal}
          onOpenCard={(card) => setDetailCard(card)}
          deck={draft}
          update={update}
          onScopeChange={setScope}
          onClose={() => {
            setSearchModal(null);
            setQuery("");
          }}
        />
      )}

      {/* Browse collection — everything you own in the commander's identity */}
      {browseOpen && (
        <CardSearchModal
          initialQuery=""
          initialFilters={{ colors: draft.colorIdentity, colorMode: "identity" }}
          initialScope="collection"
          autoRun
          onOpenCard={(card) => setDetailCard(card)}
          deck={draft}
          update={update}
          onScopeChange={setScope}
          onClose={() => setBrowseOpen(false)}
        />
      )}

      {/* Suggestions — otag discovery / EDHREC synergy */}
      {suggest !== null && (
        <SuggestionsModal
          deck={draft}
          update={update}
          initialOtag={suggest.otag}
          initialCategory={suggest.category}
          onOpenCard={(c) => void openCard(c)}
          onClose={() => setSuggest(null)}
        />
      )}

      {/* Save + changelog modal */}
      {saveOpen && (
        <ModalShell onClose={() => setSaveOpen(false)} size="sm" title="Save deck">
          <div>
            {diff.adds.length + diff.cuts.length > 0 ? (
              <div className="mb-3 max-h-44 overflow-y-auto rounded-md bg-stone-900 p-2 text-xs">
                {diff.adds.map((a, i) => (
                  <div key={`a${i}`} className="text-emerald-400">+ {a.name}</div>
                ))}
                {diff.cuts.map((c, i) => (
                  <div key={`c${i}`} className="text-rose-400">− {c.name}</div>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-xs text-stone-500">
                No card changes (categories/printings/settings only).
              </p>
            )}
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Changelog title (optional)"
              className="mb-3 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
            />
            <p className="mb-3 text-[10px] text-stone-600">
              Saving with a changelog stores a full snapshot — restorable any time from the
              History tab.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => void save(false)}
                disabled={saving}
                className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700 disabled:opacity-40"
              >
                Save without changelog
              </button>
              <button
                onClick={() => void save(true)}
                disabled={saving}
                className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save + changelog entry"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </DndContext>
  );
}

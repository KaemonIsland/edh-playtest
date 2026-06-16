"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
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
} from "@dnd-kit/core";
import type { CategorySetting, Deck, DeckEntry, ScryCard } from "@/types";
import { getRepo, type VersionChange } from "@/lib/repo";
import { groupEntries, typeGroup } from "@/lib/deck/stats";
import { searchCards, getCardDbStatus } from "@/lib/cards/carddb";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";
import { CardSearchModal } from "@/components/builder/CardSearchModal";
import { CardDetailModal } from "@/components/builder/CardDetailModal";

type ViewMode = "stacks" | "text";
const VIEW_KEY = "edh-playtest:builder-view";
const COMMANDER_DROP = "cat:__commander__";

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

function TextRow({ entry, onOpen }: { entry: DeckEntry; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.card.id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className="flex w-full cursor-grab items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-stone-300 transition hover:bg-stone-800"
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <span className="w-4 shrink-0 text-stone-600">{entry.quantity}</span>
      <span className="min-w-0 flex-1 truncate">{entry.card.name}</span>
      <ManaCost cost={entry.card.mana_cost} size={11} className="shrink-0" />
    </button>
  );
}

/** Archidekt-style stack: overlapping card images, hover lifts a card. */
function StackCard({ entry, onOpen }: { entry: DeckEntry; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.card.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className="relative h-10 cursor-grab overflow-visible transition-[z-index] hover:z-30"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      title={entry.card.name}
    >
      <CardImage
        card={entry.card}
        className="w-full shadow-md shadow-black/60 hover:ring-2 hover:ring-stone-500"
      />
      {entry.quantity > 1 && (
        <span className="absolute top-1 left-1 z-10 rounded-full bg-black/80 px-1.5 text-[10px] font-bold text-white">
          ×{entry.quantity}
        </span>
      )}
    </div>
  );
}

function DropHint() {
  return (
    <div className="rounded border border-dashed border-stone-800 px-2 py-3 text-center text-[10px] text-stone-700">
      drop cards here
    </div>
  );
}

function CategoryColumn({
  name,
  dropId,
  entries,
  setting,
  viewMode,
  accent,
  onOpen,
  onToggleSetting,
}: {
  name: string;
  dropId: string;
  entries: DeckEntry[];
  setting: CategorySetting | undefined;
  viewMode: ViewMode;
  accent?: "commander";
  onOpen: (card: ScryCard) => void;
  onToggleSetting?: (key: keyof CategorySetting) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const count = entries.reduce((n, e) => n + e.quantity, 0);
  const inDeck = setting?.inDeck !== false;
  const inPrice = setting?.inPrice !== false;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border p-2 transition-colors ${
        isOver
          ? "border-emerald-600/70 bg-emerald-950/20"
          : accent === "commander"
            ? "border-amber-800/50 bg-amber-950/10"
            : inDeck
              ? "border-stone-800 bg-stone-950"
              : "border-stone-800 bg-stone-950/50 opacity-80"
      }`}
    >
      <div className="relative mb-1.5 flex items-center justify-between px-1">
        <span
          className={`truncate text-xs font-bold ${accent === "commander" ? "text-amber-400" : "text-emerald-500"}`}
        >
          {name} <span className="font-normal text-stone-600">({count})</span>
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
              {inPrice ? "Exclude from price" : "Include in price"}
            </button>
          </div>
        )}
      </div>

      {viewMode === "text" ? (
        <div className="flex min-h-8 flex-col gap-0.5">
          {entries.map((e) => (
            <TextRow key={e.card.id} entry={e} onOpen={() => onOpen(e.card)} />
          ))}
          {entries.length === 0 && <DropHint />}
        </div>
      ) : (
        <div className="flex min-h-8 flex-col pb-[120%]">
          {entries.map((e) => (
            <StackCard key={e.card.id} entry={e} onOpen={() => onOpen(e.card)} />
          ))}
          {entries.length === 0 && <DropHint />}
        </div>
      )}
    </div>
  );
}

export default function DeckEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [original, setOriginal] = useState<Deck | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [detailCard, setDetailCard] = useState<ScryCard | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("stacks");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryCard[]>([]);
  const [searchModal, setSearchModal] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragName, setDragName] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "text" || saved === "stacks") setViewMode(saved);
    } catch {
      // ignore
    }
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dirty = useMemo(
    () => original && draft && JSON.stringify(original) !== JSON.stringify(draft),
    [original, draft],
  );

  const groups = useMemo(() => (draft ? groupEntries(draft) : []), [draft]);
  const commanderEntries = useMemo(
    () => draft?.entries.filter((e) => e.isCommander) ?? [],
    [draft],
  );

  const update = (fn: (d: Deck) => void) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  // Debounced quick-search dropdown
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      void searchCards(query, 8).then(setResults);
    }, 250);
  }, [query]);

  if (draft === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#08080a] text-sm text-stone-500">
        {original === null ? "Deck not found." : "Loading…"}
      </div>
    );
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragName(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId?.startsWith("cat:")) return;
    const cardId = String(e.active.id);

    if (overId === COMMANDER_DROP) {
      update((d) => {
        const entry = d.entries.find((x) => x.card.id === cardId);
        if (!entry) return;
        entry.isCommander = true;
        d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
        d.colorIdentity = [...new Set(d.commanders.flatMap((c) => c.color_identity))];
      });
      return;
    }

    const category = overId.slice(4);
    update((d) => {
      const entry = d.entries.find((x) => x.card.id === cardId);
      if (!entry) return;
      // Moving out of the commander column happens by dropping elsewhere.
      if (entry.isCommander) {
        entry.isCommander = false;
        d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
        d.colorIdentity = [...new Set(d.commanders.flatMap((c) => c.color_identity))];
      }
      const isTypeGroup = category === typeGroup(entry.card);
      entry.categories = isTypeGroup
        ? []
        : [category, ...entry.categories.filter((c) => c !== category)];
      if (
        !isTypeGroup &&
        d.categorySettings?.[category] === undefined &&
        (category === "Sideboard" || category === "Maybeboard")
      ) {
        d.categorySettings = { ...d.categorySettings, [category]: { inDeck: false, inPrice: false } };
      }
    });
  };

  const toggleSetting = (name: string, key: keyof CategorySetting) => {
    update((d) => {
      const current: CategorySetting = d.categorySettings?.[name] ?? { inDeck: true, inPrice: true };
      d.categorySettings = { ...d.categorySettings, [name]: { ...current, [key]: !current[key] } };
    });
  };

  const save = async (withChangelog: boolean) => {
    if (!draft || !original) return;
    setSaving(true);
    try {
      const repo = getRepo();
      await repo.saveDeck(draft);
      if (withChangelog) {
        const { adds, cuts } = diffDecks(original, draft);
        if (adds.length > 0 || cuts.length > 0) {
          await repo.addVersion({
            deckId: draft.id,
            date: Date.now(),
            title: saveTitle.trim() || `Update — ${new Date().toLocaleDateString()}`,
            adds,
            cuts,
          });
        }
      }
      router.push(`/d/${draft.id}`);
    } finally {
      setSaving(false);
    }
  };

  const diff = original ? diffDecks(original, draft) : { adds: [], cuts: [] };
  const cardDb = getCardDbStatus();
  // Excluded categories (sideboard/maybeboard/anything marked not-in-deck) go
  // on the right rail; the rest stay in the main deck grid.
  const inDeckGroups = groups.filter((gp) => gp.inDeck);
  const excludedGroups = groups.filter((gp) => !gp.inDeck);
  // Empty board columns only appear as drop targets while dragging.
  const boardColumns = (["Sideboard", "Maybeboard"] as const).filter(
    (b) => !groups.some((g) => g.group === b) && dragName !== null,
  );
  const showCommanderColumn = commanderEntries.length > 0 || dragName !== null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const entry = draft.entries.find((x) => x.card.id === String(e.active.id));
        setDragName(entry?.card.name ?? null);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-dvh flex-col bg-[#08080a] text-stone-200">
        {/* Builder top bar */}
        <header className="flex flex-wrap items-center gap-2 border-b border-stone-800 bg-stone-950 px-3 py-2">
          <Link href={`/d/${id}`} className="text-xs text-stone-500 hover:text-stone-200">
            ← Showcase
          </Link>
          <input
            value={draft.name}
            onChange={(e) => update((d) => void (d.name = e.target.value))}
            className="w-48 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-sm font-bold outline-none focus:border-emerald-600"
          />
          <span className="text-[11px] text-stone-500">
            {draft.entries.reduce((n, e) => n + (e.isCommander ? 0 : e.quantity), 0)} +{" "}
            {draft.commanders.length} cmdr
          </span>

          {/* View toggle */}
          <div className="flex gap-0.5 rounded-lg bg-stone-900 p-0.5">
            {(["stacks", "text"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                  viewMode === mode ? "bg-stone-700 text-white" : "text-stone-500 hover:text-stone-300"
                }`}
              >
                {mode === "stacks" ? "🂠 Stacks" : "≡ Text"}
              </button>
            ))}
          </div>

          {/* Quick search — Enter opens the full search modal */}
          <div className="relative ml-1 min-w-56 flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearchModal(query);
                  setResults([]);
                }
              }}
              placeholder={
                cardDb.syncedAt
                  ? "Add a card — Enter for full search…"
                  : "Add a card (Scryfall) — Enter for full search…"
              }
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
            />
            {results.length > 0 && (
              <div className="absolute top-9 right-0 left-0 z-40 max-h-80 overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 shadow-2xl">
                {results.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      setDetailCard(card);
                      setQuery("");
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-200 hover:bg-stone-800"
                  >
                    <span className="min-w-0 flex-1 truncate">{card.name}</span>
                    <ManaCost cost={card.mana_cost} size={11} />
                    <span className="w-32 shrink-0 truncate text-right text-[10px] text-stone-600">
                      {card.type_line}
                    </span>
                  </button>
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
              </div>
            )}
          </div>
          <button
            onClick={() => setSearchModal(query)}
            className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
          >
            🔍 Advanced
          </button>

          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-[10px] font-bold text-amber-400">● unsaved</span>}
            <button
              onClick={() => {
                setDraft(structuredClone(original));
                setDetailCard(null);
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

        {/* Deck columns on the left (wrap H+V); excluded boards on a right rail. */}
        <div className="flex min-h-0 flex-1">
          <main
            className="grid flex-1 content-start items-start gap-3 overflow-y-auto p-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {showCommanderColumn && (
              <CategoryColumn
                name="Commander"
                dropId={COMMANDER_DROP}
                entries={commanderEntries}
                setting={undefined}
                viewMode={viewMode}
                accent="commander"
                onOpen={setDetailCard}
              />
            )}
            {inDeckGroups.map(({ group, entries }) => (
              <CategoryColumn
                key={group}
                name={group}
                dropId={`cat:${group}`}
                entries={entries}
                setting={draft.categorySettings?.[group]}
                viewMode={viewMode}
                onOpen={setDetailCard}
                onToggleSetting={(key) => toggleSetting(group, key)}
              />
            ))}
          </main>

          {/* Right rail: sideboard / maybeboard / any "not in deck" category */}
          {(excludedGroups.length > 0 || boardColumns.length > 0) && (
            <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-l border-stone-800 bg-stone-950/60 p-3">
              <div className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                Not in deck
              </div>
              {excludedGroups.map(({ group, entries }) => (
                <CategoryColumn
                  key={group}
                  name={group}
                  dropId={`cat:${group}`}
                  entries={entries}
                  setting={draft.categorySettings?.[group]}
                  viewMode={viewMode}
                  onOpen={setDetailCard}
                  onToggleSetting={(key) => toggleSetting(group, key)}
                />
              ))}
              {boardColumns.map((b) => (
                <CategoryColumn
                  key={b}
                  name={b}
                  dropId={`cat:${b}`}
                  entries={[]}
                  setting={draft.categorySettings?.[b] ?? { inDeck: false, inPrice: false }}
                  viewMode={viewMode}
                  onOpen={setDetailCard}
                  onToggleSetting={(key) => toggleSetting(b, key)}
                />
              ))}
            </aside>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragName && (
          <div className="rounded bg-stone-800 px-2 py-1 text-xs text-white shadow-2xl">{dragName}</div>
        )}
      </DragOverlay>

      {/* Card detail modal (from columns or quick-search) */}
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
          onClose={() => {
            setSearchModal(null);
            setQuery("");
          }}
        />
      )}

      {/* Save + changelog modal */}
      {saveOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSaveOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-stone-700 bg-stone-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-bold text-stone-200">Save deck</h3>
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
        </div>
      )}
    </DndContext>
  );
}

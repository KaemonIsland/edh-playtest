"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { searchCards, fetchPrintings, getCardDbStatus } from "@/lib/cards/carddb";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";

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
    if (qty < next || next < qty) {
      if (next < qty) cuts.push({ name: qty - next > 1 ? `${qty - next}x ${name}` : name });
    }
  }
  return { adds, cuts };
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: DeckEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.card.id,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`flex w-full cursor-grab items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition ${
        selected ? "bg-sky-900/50 text-white ring-1 ring-sky-600" : "text-stone-300 hover:bg-stone-800"
      }`}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <span className="w-4 shrink-0 text-stone-600">{entry.quantity}</span>
      <span className="min-w-0 flex-1 truncate">{entry.card.name}</span>
      <ManaCost cost={entry.card.mana_cost} size={11} className="shrink-0" />
    </button>
  );
}

function CategoryColumn({
  name,
  entries,
  setting,
  selectedId,
  onSelect,
  onToggleSetting,
}: {
  name: string;
  entries: DeckEntry[];
  setting: CategorySetting | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleSetting: (key: keyof CategorySetting) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${name}` });
  const count = entries.reduce((n, e) => n + e.quantity, 0);
  const inDeck = setting?.inDeck !== false;
  const inPrice = setting?.inPrice !== false;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-60 shrink-0 flex-col rounded-lg border p-2 transition-colors ${
        isOver
          ? "border-emerald-600/70 bg-emerald-950/20"
          : inDeck
            ? "border-stone-800 bg-stone-950"
            : "border-stone-800 bg-stone-950/50 opacity-80"
      }`}
    >
      <div className="relative mb-1.5 flex items-center justify-between px-1">
        <span className="truncate text-xs font-bold text-emerald-500">
          {name} <span className="font-normal text-stone-600">({count})</span>
        </span>
        <div className="flex items-center gap-1">
          {!inDeck && (
            <span className="rounded bg-stone-800 px-1 text-[8px] font-bold tracking-wide text-stone-500 uppercase">
              not in deck
            </span>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded px-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
          >
            ⋮
          </button>
        </div>
        {menuOpen && (
          <div className="absolute top-6 right-0 z-30 w-48 rounded-lg border border-stone-700 bg-stone-900 py-1 shadow-2xl">
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
      <div className="flex min-h-10 flex-col gap-0.5 overflow-y-auto">
        {entries.map((e) => (
          <EntryRow
            key={e.card.id}
            entry={e}
            selected={selectedId === e.card.id}
            onSelect={() => onSelect(e.card.id)}
          />
        ))}
        {entries.length === 0 && (
          <div className="rounded border border-dashed border-stone-800 px-2 py-3 text-center text-[10px] text-stone-700">
            drop cards here
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeckEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [original, setOriginal] = useState<Deck | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryCard[]>([]);
  const [printings, setPrintings] = useState<ScryCard[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragName, setDragName] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dirty = useMemo(
    () => original && draft && JSON.stringify(original) !== JSON.stringify(draft),
    [original, draft],
  );

  const groups = useMemo(() => (draft ? groupEntries(draft) : []), [draft]);
  const selectedEntry = draft?.entries.find((e) => e.card.id === selectedId) ?? null;
  const allCategories = useMemo(() => {
    const names = new Set<string>(groups.map((g) => g.group));
    names.add("Sideboard");
    names.add("Maybeboard");
    return [...names].sort();
  }, [groups]);

  const update = (fn: (d: Deck) => void) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  // Debounced card search
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      void searchCards(query).then(setResults);
    }, 250);
  }, [query]);

  if (draft === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#08080a] text-sm text-stone-500">
        {original === null ? "Deck not found." : "Loading…"}
      </div>
    );
  }

  const addCard = (card: ScryCard) => {
    update((d) => {
      const existing = d.entries.find((e) => e.card.oracle_id === card.oracle_id && !e.isCommander);
      if (existing) existing.quantity += 1;
      else d.entries.push({ card, quantity: 1, isCommander: false, categories: [] });
    });
    setSelectedId(card.id);
    setQuery("");
    setResults([]);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragName(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId?.startsWith("cat:")) return;
    const category = overId.slice(4);
    const cardId = String(e.active.id);
    update((d) => {
      const entry = d.entries.find((x) => x.card.id === cardId);
      if (!entry) return;
      // Premier category = first; type-group columns mean "no explicit category".
      const isTypeGroup = d.entries.every(() => true) && category === typeGroup(entry.card);
      entry.categories = isTypeGroup ? [] : [category, ...entry.categories.filter((c) => c !== category)];
      if (!isTypeGroup && d.categorySettings?.[category] === undefined && (category === "Sideboard" || category === "Maybeboard")) {
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
            className="w-56 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-sm font-bold outline-none focus:border-emerald-600"
          />
          <span className="text-[11px] text-stone-500">
            {draft.entries.reduce((n, e) => n + (e.isCommander ? 0 : e.quantity), 0)} cards +{" "}
            {draft.commanders.length} cmdr
          </span>

          {/* Search to add */}
          <div className="relative ml-2 min-w-64 flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                cardDb.syncedAt
                  ? `Add a card (local DB: ${cardDb.count.toLocaleString()} cards)…`
                  : "Add a card (Scryfall search — sync the card DB on /decks for offline)…"
              }
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
            />
            {results.length > 0 && (
              <div className="absolute top-9 right-0 left-0 z-40 max-h-80 overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 shadow-2xl">
                {results.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => addCard(card)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-200 hover:bg-stone-800"
                  >
                    <span className="min-w-0 flex-1 truncate">{card.name}</span>
                    <ManaCost cost={card.mana_cost} size={11} />
                    <span className="w-32 shrink-0 truncate text-right text-[10px] text-stone-600">
                      {card.type_line}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-[10px] font-bold text-amber-400">● unsaved</span>}
            <button
              onClick={() => {
                setDraft(structuredClone(original));
                setSelectedId(null);
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

        <div className="flex min-h-0 flex-1">
          {/* Category stacks */}
          <main className="flex flex-1 items-start gap-3 overflow-auto p-3">
            {groups.map(({ group, entries }) => (
              <CategoryColumn
                key={group}
                name={group}
                entries={entries}
                setting={draft.categorySettings?.[group]}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggleSetting={(key) => toggleSetting(group, key)}
              />
            ))}
            {/* Always-available board columns */}
            {(["Sideboard", "Maybeboard"] as const)
              .filter((b) => !groups.some((g) => g.group === b))
              .map((b) => (
                <CategoryColumn
                  key={b}
                  name={b}
                  entries={[]}
                  setting={draft.categorySettings?.[b] ?? { inDeck: false, inPrice: false }}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onToggleSetting={(key) => toggleSetting(b, key)}
                />
              ))}
          </main>

          {/* Card detail editor */}
          {selectedEntry && (
            <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-stone-800 bg-stone-950 p-3">
              <CardImage card={selectedEntry.card} className="aspect-[5/7] w-full" />
              <div>
                <div className="text-sm font-bold text-stone-100">{selectedEntry.card.name}</div>
                <div className="text-[11px] text-stone-500">{selectedEntry.card.type_line}</div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">Qty</span>
                <button
                  onClick={() =>
                    update((d) => {
                      const e = d.entries.find((x) => x.card.id === selectedEntry.card.id);
                      if (e) e.quantity = Math.max(1, e.quantity - 1);
                    })
                  }
                  className="h-7 w-7 rounded bg-stone-800 text-stone-300 hover:bg-stone-700"
                >
                  −
                </button>
                <span className="min-w-6 text-center text-sm font-bold">{selectedEntry.quantity}</span>
                <button
                  onClick={() =>
                    update((d) => {
                      const e = d.entries.find((x) => x.card.id === selectedEntry.card.id);
                      if (e) e.quantity += 1;
                    })
                  }
                  className="h-7 w-7 rounded bg-stone-800 text-stone-300 hover:bg-stone-700"
                >
                  +
                </button>
                <button
                  onClick={() => {
                    update((d) => {
                      d.entries = d.entries.filter((x) => x.card.id !== selectedEntry.card.id);
                    });
                    setSelectedId(null);
                  }}
                  className="ml-auto rounded bg-stone-800 px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-stone-700"
                >
                  🗑 Remove
                </button>
              </div>

              {/* Categories */}
              <div>
                <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                  Categories (first = premier)
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedEntry.categories.map((cat, i) => (
                    <span
                      key={cat}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                        i === 0 ? "bg-emerald-900/70 text-emerald-200" : "bg-stone-800 text-stone-300"
                      }`}
                    >
                      {i === 0 && "★ "}
                      {cat}
                      <button
                        onClick={() =>
                          update((d) => {
                            const e = d.entries.find((x) => x.card.id === selectedEntry.card.id);
                            if (e) e.categories = e.categories.filter((c) => c !== cat);
                          })
                        }
                        className="text-stone-500 hover:text-rose-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1">
                  <input
                    list="builder-categories"
                    placeholder="Add category…"
                    className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-[11px] outline-none focus:border-emerald-600"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value) {
                          update((d) => {
                            const en = d.entries.find((x) => x.card.id === selectedEntry.card.id);
                            if (en && !en.categories.includes(value)) en.categories.push(value);
                          });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                  <datalist id="builder-categories">
                    {allCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Printing / variation picker */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                    Printing / variation
                  </span>
                  <button
                    onClick={() =>
                      void fetchPrintings(selectedEntry.card.oracle_id).then(setPrintings)
                    }
                    className="text-[11px] text-sky-400 hover:text-sky-300"
                  >
                    Browse printings…
                  </button>
                </div>
                {printings && (
                  <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-stone-800 p-1.5">
                    {printings.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          update((d) => {
                            const e = d.entries.find((x) => x.card.id === selectedEntry.card.id);
                            if (e) e.card = p;
                            const ci = d.commanders.findIndex(
                              (c) => c.oracle_id === p.oracle_id,
                            );
                            if (ci >= 0) d.commanders[ci] = p;
                          });
                          setSelectedId(p.id);
                          setPrintings(null);
                        }}
                        className={`rounded transition hover:ring-2 hover:ring-sky-500 ${
                          p.id === selectedEntry.card.id ? "ring-2 ring-emerald-500" : ""
                        }`}
                        title={p.prices?.usd ? `$${p.prices.usd}` : undefined}
                      >
                        <CardImage card={p} className="aspect-[5/7] w-full" />
                      </button>
                    ))}
                    {printings.length === 0 && (
                      <span className="col-span-2 p-2 text-center text-[11px] text-stone-600">
                        Couldn't load printings.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Commander toggle */}
              <button
                onClick={() =>
                  update((d) => {
                    const e = d.entries.find((x) => x.card.id === selectedEntry.card.id);
                    if (!e) return;
                    e.isCommander = !e.isCommander;
                    d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
                    d.colorIdentity = [
                      ...new Set(d.commanders.flatMap((c) => c.color_identity)),
                    ];
                  })
                }
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  selectedEntry.isCommander
                    ? "bg-amber-700 text-white hover:bg-amber-600"
                    : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                }`}
              >
                {selectedEntry.isCommander ? "★ Unset commander" : "♛ Set as commander"}
              </button>
            </aside>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragName && (
          <div className="rounded bg-stone-800 px-2 py-1 text-xs text-white shadow-2xl">
            {dragName}
          </div>
        )}
      </DragOverlay>

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

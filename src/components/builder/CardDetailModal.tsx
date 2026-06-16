"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Deck, DeckEntry, ScryCard } from "@/types";
import { getRepo } from "@/lib/repo";
import { fetchPrintings } from "@/lib/cards/carddb";
import { typeGroup } from "@/lib/deck/stats";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";

type Tab = "options" | "indecks" | "collection" | "info" | "rulings";

const TABS: { key: Tab; label: string }[] = [
  { key: "options", label: "Card options" },
  { key: "indecks", label: "In decks" },
  { key: "collection", label: "Collection records" },
  { key: "info", label: "Card info" },
  { key: "rulings", label: "Rulings" },
];

const QUICK_CATEGORIES = ["Draw", "Interaction", "Ramp", "Maybeboard"];

interface Ruling {
  published_at: string;
  comment: string;
}

function printingLabel(p: ScryCard): string {
  const set = p.set_name ?? p.set?.toUpperCase() ?? "Unknown set";
  return `${set}${p.set ? ` (${p.set})` : ""}${p.collector_number ? ` · ${p.collector_number}` : ""}`;
}

/**
 * Archidekt-style card detail modal: quantity, commander, categories,
 * printing picker, plus In decks / Card info / Rulings tabs. `entry` is the
 * deck entry matched by oracle id (null = not in the deck yet, qty 0).
 */
export function CardDetailModal({
  card,
  deck,
  update,
  onClose,
  siblings,
  onNavigate,
}: {
  card: ScryCard;
  deck: Deck;
  update: (fn: (d: Deck) => void) => void;
  onClose: () => void;
  /** Optional prev/next navigation context (search results or column). */
  siblings?: ScryCard[];
  onNavigate?: (card: ScryCard) => void;
}) {
  const [tab, setTab] = useState<Tab>("options");
  const [printings, setPrintings] = useState<ScryCard[] | null>(null);
  const [allPrintingsOpen, setAllPrintingsOpen] = useState(false);
  const [printFilter, setPrintFilter] = useState("");
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [inDecks, setInDecks] = useState<{ id: string; name: string }[] | null>(null);

  const entry: DeckEntry | null =
    deck.entries.find((e) => e.card.oracle_id === card.oracle_id) ?? null;
  // Prefer the deck's chosen printing for display when the card is in the deck.
  const shown = entry?.card.oracle_id === card.oracle_id ? entry.card : card;
  const qty = entry?.quantity ?? 0;
  const allCategories = useMemo(() => {
    const names = new Set<string>(QUICK_CATEGORIES);
    for (const e of deck.entries) for (const c of e.categories) names.add(c);
    return [...names].sort();
  }, [deck.entries]);

  // Reset per-card state when navigating between cards.
  useEffect(() => {
    setPrintings(null);
    setRulings(null);
    setInDecks(null);
    setAllPrintingsOpen(false);
    setPrintFilter("");
  }, [card.oracle_id]);

  // Lazy-load printings for the dropdown.
  useEffect(() => {
    void fetchPrintings(card.oracle_id).then(setPrintings);
  }, [card.oracle_id]);

  useEffect(() => {
    if (tab === "rulings" && rulings === null) {
      void fetch(`/api/cards/rulings?id=${encodeURIComponent(shown.id)}`)
        .then((r) => (r.ok ? r.json() : { rulings: [] }))
        .then((d: { rulings: Ruling[] }) => setRulings(d.rulings))
        .catch(() => setRulings([]));
    }
    if (tab === "indecks" && inDecks === null) {
      void (async () => {
        const repo = getRepo();
        const metas = await repo.listDecks();
        const hits: { id: string; name: string }[] = [];
        for (const m of metas) {
          const full = await repo.getDeck(m.id);
          if (
            full &&
            (full.deck.entries.some((e) => e.card.oracle_id === card.oracle_id) ||
              full.deck.commanders.some((c) => c.oracle_id === card.oracle_id))
          ) {
            hits.push({ id: m.id, name: m.name });
          }
        }
        setInDecks(hits);
      })();
    }
  }, [tab, rulings, inDecks, shown.id, card.oracle_id]);

  const setQty = (next: number) => {
    update((d) => {
      const e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
      if (next <= 0) {
        if (e) {
          d.entries = d.entries.filter((x) => x.card.oracle_id !== card.oracle_id);
          d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
        }
        return;
      }
      if (e) e.quantity = next;
      else d.entries.push({ card: shown, quantity: next, isCommander: false, categories: [] });
    });
  };

  const toggleCommander = () => {
    update((d) => {
      let e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
      if (!e) {
        e = { card: shown, quantity: 1, isCommander: false, categories: [] };
        d.entries.push(e);
      }
      e.isCommander = !e.isCommander;
      d.commanders = d.entries.filter((x) => x.isCommander).map((x) => x.card);
      d.colorIdentity = [...new Set(d.commanders.flatMap((c) => c.color_identity))];
    });
  };

  const addCategory = (cat: string) => {
    update((d) => {
      let e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
      if (!e) {
        e = { card: shown, quantity: 1, isCommander: false, categories: [] };
        d.entries.push(e);
      }
      if (!e.categories.includes(cat)) e.categories.push(cat);
      if (
        d.categorySettings?.[cat] === undefined &&
        (cat === "Sideboard" || cat === "Maybeboard")
      ) {
        d.categorySettings = { ...d.categorySettings, [cat]: { inDeck: false, inPrice: false } };
      }
    });
  };

  const selectPrinting = (p: ScryCard) => {
    update((d) => {
      const e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
      if (e) e.card = p;
      const ci = d.commanders.findIndex((c) => c.oracle_id === p.oracle_id);
      if (ci >= 0) d.commanders[ci] = p;
    });
    onNavigate?.(p); // keep the modal's `card` in sync with the chosen printing
    setAllPrintingsOpen(false);
  };

  const idx = siblings?.findIndex((s) => s.oracle_id === card.oracle_id) ?? -1;
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && idx < (siblings?.length ?? 0) - 1 ? siblings![idx + 1] : null;

  const oracleText =
    shown.oracle_text ??
    shown.card_faces?.map((f) => `${f.name}\n${f.oracle_text ?? ""}`).join("\n—\n") ??
    "";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-3xl rounded-xl border border-stone-700 bg-stone-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + tabs */}
        <div className="border-b border-stone-800 px-5 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-bold text-stone-100">{shown.name}</h2>
            <button onClick={onClose} className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200">
              ✕
            </button>
          </div>
          <div className="mt-2 flex gap-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`border-b-2 pb-2 text-xs font-semibold whitespace-nowrap transition ${
                  tab === t.key
                    ? "border-amber-500 text-stone-100"
                    : "border-transparent text-stone-500 hover:text-stone-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          {/* Card image (always visible) */}
          <div className="mx-auto w-64 shrink-0 sm:mx-0">
            <CardImage card={shown} className="aspect-[5/7] w-full" />
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-stone-500">{shown.set_name ?? ""}</span>
              <span className="font-semibold text-emerald-400">
                {shown.prices?.usd ? `TCG $${shown.prices.usd}` : "—"}
              </span>
            </div>
          </div>

          {/* Tab content */}
          <div className="min-w-0 flex-1">
            {tab === "options" && (
              <div className="flex flex-col gap-4">
                {/* Quantity + commander */}
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                      Quantity
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={(e) => setQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-16 rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-emerald-600"
                      />
                      <button
                        onClick={() => setQty(qty - 1)}
                        disabled={qty === 0}
                        className="h-9 w-9 rounded-md bg-stone-800 font-bold text-rose-400 hover:bg-stone-700 disabled:opacity-40"
                      >
                        −
                      </button>
                      <button
                        onClick={() => setQty(qty + 1)}
                        className="h-9 w-9 rounded-md bg-stone-800 font-bold text-emerald-400 hover:bg-stone-700"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={toggleCommander}
                    className={`mt-4 ml-auto rounded-md px-4 py-2 text-xs font-bold ${
                      entry?.isCommander
                        ? "bg-amber-700 text-white hover:bg-amber-600"
                        : "border border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800"
                    }`}
                  >
                    {entry?.isCommander ? "★ Unset Commander" : "♛ Set Commander"}
                  </button>
                </div>

                {/* Printing */}
                <div>
                  <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                    Printing
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={shown.id}
                      onChange={(e) => {
                        const p = printings?.find((x) => x.id === e.target.value);
                        if (p) selectPrinting(p);
                      }}
                      className="w-full rounded-md border border-stone-700 bg-stone-900 px-2.5 py-2 text-xs outline-none focus:border-emerald-600"
                    >
                      {(printings ?? [shown]).map((p) => (
                        <option key={p.id} value={p.id}>
                          {printingLabel(p)}
                          {p.prices?.usd ? ` — $${p.prices.usd}` : ""}
                        </option>
                      ))}
                      {printings === null && <option>Loading printings…</option>}
                    </select>
                    <button
                      onClick={() => setAllPrintingsOpen(true)}
                      disabled={!printings || printings.length === 0}
                      className="shrink-0 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-stone-800 disabled:opacity-40"
                    >
                      ▦ All printings
                    </button>
                  </div>
                </div>

                {/* Categories */}
                <div className="rounded-lg border border-stone-800 bg-stone-900/40 p-3">
                  <div className="mb-1.5 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                    Categories <span className="normal-case">(★ = premier)</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {(entry?.categories ?? []).map((cat, i) => (
                      <div key={cat} className="flex items-center gap-2 rounded-md bg-stone-900 px-2.5 py-1.5">
                        <button
                          onClick={() =>
                            update((d) => {
                              const e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
                              if (e)
                                e.categories = [cat, ...e.categories.filter((c) => c !== cat)];
                            })
                          }
                          className={i === 0 ? "text-amber-400" : "text-stone-600 hover:text-amber-400"}
                          title={i === 0 ? "Premier category" : "Make premier"}
                        >
                          ★
                        </button>
                        <span className="flex-1 text-xs text-stone-200">{cat}</span>
                        <button
                          onClick={() =>
                            update((d) => {
                              const e = d.entries.find((x) => x.card.oracle_id === card.oracle_id);
                              if (e) e.categories = e.categories.filter((c) => c !== cat);
                            })
                          }
                          className="text-stone-600 hover:text-rose-400"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {(entry?.categories ?? []).length === 0 && (
                      <span className="text-[11px] text-stone-600">
                        None — grouped by type ({typeGroup(shown)}).
                      </span>
                    )}
                  </div>
                  <input
                    list="detail-categories"
                    placeholder="+ Add category (Enter)…"
                    className="mt-2 w-full rounded-md border border-stone-700 bg-stone-950 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-600"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value) {
                          addCategory(value);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                  <datalist id="detail-categories">
                    {allCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                      Quick category options
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => addCategory(cat)}
                          className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-[11px] font-semibold text-stone-200 hover:bg-stone-800"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "indecks" && (
              <div>
                {inDecks === null ? (
                  <p className="text-xs text-stone-600">Checking your decks…</p>
                ) : inDecks.length === 0 ? (
                  <p className="text-xs text-stone-600">Not used in any saved deck.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {inDecks.map((d) => (
                      <Link
                        key={d.id}
                        href={`/d/${d.id}`}
                        className="rounded-md bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-stone-800"
                      >
                        {d.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "collection" && (
              <p className="text-xs text-stone-600">
                Collection tracking arrives in Phase 5 — this tab will show how many copies you
                own, in which printings/finishes.
              </p>
            )}

            {tab === "info" && (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <ManaCost cost={shown.mana_cost} size={16} />
                  <span className="text-xs text-stone-500">MV {shown.cmc}</span>
                </div>
                <div className="text-xs font-semibold text-stone-300">{shown.type_line}</div>
                <p className="text-xs leading-relaxed whitespace-pre-line text-stone-300">
                  {oracleText || "—"}
                </p>
                {(shown.power !== undefined || shown.loyalty !== undefined) && (
                  <div className="text-xs font-bold text-stone-400">
                    {shown.power !== undefined ? `${shown.power}/${shown.toughness}` : `Loyalty ${shown.loyalty}`}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-stone-500">
                  <span>Set: {shown.set_name ?? "—"}</span>
                  <span>Collector #: {shown.collector_number ?? "—"}</span>
                  <span>Identity: {shown.color_identity.join("") || "C"}</span>
                  <span>
                    Commander:{" "}
                    {shown.legalities["commander"] === "legal"
                      ? "Legal"
                      : (shown.legalities["commander"]?.replace("_", " ") ?? "unknown")}
                  </span>
                  <span className="col-span-2 text-emerald-400">
                    {shown.prices?.usd ? `TCGplayer market: $${shown.prices.usd}` : "No price data"}
                  </span>
                </div>
              </div>
            )}

            {tab === "rulings" && (
              <div>
                {rulings === null ? (
                  <p className="text-xs text-stone-600">Loading rulings…</p>
                ) : rulings.length === 0 ? (
                  <p className="text-xs text-stone-600">No rulings for this card.</p>
                ) : (
                  <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                    {rulings.map((r, i) => (
                      <div key={i} className="rounded-md bg-stone-900 px-3 py-2">
                        <div className="text-[10px] text-stone-500">{r.published_at}</div>
                        <p className="mt-0.5 text-xs leading-relaxed text-stone-300">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Prev / next navigation */}
        {(prev || next) && (
          <div className="flex items-center justify-between border-t border-stone-800 px-5 py-3">
            {prev ? (
              <button
                onClick={() => onNavigate?.(prev)}
                className="max-w-[45%] truncate rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
              >
                ← {prev.name}
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button
                onClick={() => onNavigate?.(next)}
                className="max-w-[45%] truncate rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
              >
                {next.name} →
              </button>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>

      {/* Full-page "Select a printing" overlay */}
      {allPrintingsOpen && printings && (
        <div
          className="fixed inset-0 z-[95] overflow-y-auto bg-black/90 p-6 backdrop-blur"
          onClick={(e) => {
            e.stopPropagation();
            setAllPrintingsOpen(false);
          }}
        >
          <div className="mx-auto max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-white">Select a printing</h2>
              <input
                value={printFilter}
                onChange={(e) => setPrintFilter(e.target.value)}
                placeholder="Filter set name…"
                className="w-56 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
              />
              <button
                onClick={() => setAllPrintingsOpen(false)}
                className="ml-auto rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {printings
                .filter(
                  (p) =>
                    !printFilter.trim() ||
                    printingLabel(p).toLowerCase().includes(printFilter.trim().toLowerCase()),
                )
                .map((p) => (
                  <button key={p.id} onClick={() => selectPrinting(p)} className="group text-left">
                    <div
                      className={`relative rounded-lg transition ${
                        p.id === shown.id
                          ? "ring-3 ring-amber-500"
                          : "group-hover:ring-2 group-hover:ring-sky-500"
                      }`}
                    >
                      {p.id === shown.id && (
                        <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-t bg-amber-500 px-2 text-[10px] font-bold text-black">
                          Selected printing
                        </span>
                      )}
                      <CardImage card={p} className="aspect-[5/7] w-full" />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="min-w-0 truncate text-stone-400">{printingLabel(p)}</span>
                      <span className="shrink-0 font-semibold text-emerald-400">
                        {p.prices?.usd ? `$${p.prices.usd}` : "—"}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import type { CollectionCard } from "@/lib/repo";
import { finishPrice } from "@/lib/repo";

export interface SetGroup {
  code: string;
  name: string;
  released: string;
  unique: number;
  total: number;
  value: number;
}

/** Group owned cards into sets, newest first. */
export function groupBySet(cards: CollectionCard[]): SetGroup[] {
  const map = new Map<string, SetGroup & { printings: Set<string> }>();
  for (const c of cards) {
    const code = c.setCode ?? c.card.set ?? "unknown";
    let g = map.get(code);
    if (!g) {
      g = {
        code,
        name: c.setName ?? c.card.set_name ?? code.toUpperCase(),
        released: c.card.released_at ?? "",
        unique: 0,
        total: 0,
        value: 0,
        printings: new Set(),
      };
      map.set(code, g);
    }
    g.printings.add(c.printingId);
    g.total += c.quantity;
    const unit = finishPrice(c.card, c.finish);
    if (unit !== null) g.value += unit * c.quantity;
  }
  return [...map.values()]
    .map(({ printings, ...g }) => ({ ...g, unique: printings.size }))
    .sort((a, b) => (b.released ?? "").localeCompare(a.released ?? "") || a.name.localeCompare(b.name));
}

export function SetsBrowser({
  cards,
  totalCards,
  onAll,
  onSet,
}: {
  cards: CollectionCard[];
  totalCards: number;
  onAll: () => void;
  onSet: (code: string, name: string) => void;
}) {
  const sets = useMemo(() => groupBySet(cards), [cards]);

  return (
    <div className="flex flex-col gap-2">
      {/* All Cards bar */}
      <button
        onClick={onAll}
        className="flex items-center gap-3 rounded-xl border border-stone-700 bg-gradient-to-r from-stone-900 to-stone-950 px-4 py-4 text-left transition hover:border-emerald-600/60"
      >
        <span className="text-2xl">🗃️</span>
        <div className="flex-1">
          <div className="text-base font-bold text-stone-100">All cards</div>
          <div className="text-xs text-stone-500">Browse and filter your entire collection</div>
        </div>
        <span className="text-sm font-bold text-stone-300">{totalCards.toLocaleString()} cards</span>
        <span className="text-stone-600">→</span>
      </button>

      {/* Sets list */}
      <div className="mt-2 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
        Sets ({sets.length}) — newest first
      </div>
      <div className="flex flex-col gap-1">
        {sets.map((s) => (
          <button
            key={s.code}
            onClick={() => onSet(s.code, s.name)}
            className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-left transition hover:border-stone-600 hover:bg-stone-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://svgs.scryfall.io/sets/${s.code}.svg`}
              alt=""
              className="h-6 w-6 shrink-0 opacity-90 invert"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-stone-200">{s.name}</div>
              <div className="text-[10px] text-stone-500">
                {s.code.toUpperCase()}
                {s.released ? ` · ${s.released}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs font-bold text-stone-300">{s.unique} unique</div>
              <div className="text-[10px] text-stone-500">
                {s.total} cards{s.value > 0 ? ` · $${s.value.toFixed(0)}` : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

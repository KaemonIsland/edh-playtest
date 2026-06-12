"use client";

import { useState } from "react";
import type { Deck, ScryCard } from "@/types";
import { activeFace } from "@/types";
import { groupEntries } from "@/lib/deck/stats";
import { CardImage } from "@/components/cards/CardImage";

/** Grouped decklist with hover previews and a card-detail modal. */
export function DecklistView({ deck }: { deck: Deck }) {
  const [hover, setHover] = useState<ScryCard | null>(null);
  const [detail, setDetail] = useState<ScryCard | null>(null);
  const groups = groupEntries(deck);

  return (
    <section className="relative rounded-xl border border-stone-800 bg-stone-950 p-4">
      <h2 className="mb-3 text-sm font-bold tracking-wide text-stone-200 uppercase">Decklist</h2>
      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
        {groups.map(({ group, entries }) => (
          <div key={group} className="mb-4 break-inside-avoid">
            <h3 className="mb-1 text-xs font-bold text-emerald-500">
              {group}{" "}
              <span className="font-normal text-stone-600">
                ({entries.reduce((n, e) => n + e.quantity, 0)})
              </span>
            </h3>
            <ul>
              {entries.map((e) => (
                <li key={e.card.id}>
                  <button
                    className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left text-xs text-stone-300 hover:bg-stone-900 hover:text-white"
                    onMouseEnter={() => setHover(e.card)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setDetail(e.card)}
                  >
                    <span className="text-stone-600">{e.quantity}</span>
                    <span className="truncate">{e.card.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-stone-600">
                      {e.card.mana_cost?.replace(/[{}]/g, "") ?? ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Hover preview */}
      {hover && !detail && (
        <div className="pointer-events-none fixed top-20 right-6 z-40 hidden w-56 drop-shadow-2xl lg:block">
          <CardImage card={hover} className="aspect-[5/7] w-full" />
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl gap-4 overflow-y-auto rounded-xl border border-stone-700 bg-stone-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardImage card={detail} className="h-fit w-56 shrink-0" />
            <div className="min-w-0 text-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-stone-100">{detail.name}</h3>
                <button onClick={() => setDetail(null)} className="text-stone-500 hover:text-stone-200">✕</button>
              </div>
              <div className="text-xs text-stone-500">{detail.type_line}</div>
              <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-stone-300">
                {detail.oracle_text ??
                  detail.card_faces?.map((f) => `${f.name}\n${f.oracle_text ?? ""}`).join("\n—\n") ??
                  ""}
              </p>
              {activeFace(detail, 0).power !== undefined && (
                <div className="mt-2 text-xs font-bold text-stone-400">
                  {activeFace(detail, 0).power}/{activeFace(detail, 0).toughness}
                </div>
              )}
              {detail.prices?.usd && (
                <div className="mt-2 text-[11px] text-stone-500">${detail.prices.usd} (Scryfall)</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

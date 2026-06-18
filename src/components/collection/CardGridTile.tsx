"use client";

import { memo } from "react";
import type { ScryCard } from "@/types";
import { CardImage } from "@/components/cards/CardImage";

/**
 * Compact card tile for the collection / all-cards grids: card image, owned
 * count badge, and a price + quantity stepper. Name/set/MV are intentionally
 * omitted — they're visible on the card image itself (and in its text-frame
 * fallback when the image can't load).
 */
export const CardGridTile = memo(function CardGridTile({
  card,
  owned,
  finishBadge,
  price,
  onOpen,
  onAdjust,
}: {
  card: ScryCard;
  owned: number;
  finishBadge?: string | null;
  price: number | null;
  onOpen: () => void;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-stone-800 bg-stone-950 p-2">
      <button onClick={onOpen} className="group relative text-left" title={card.name}>
        <CardImage
          card={card}
          className={`aspect-[5/7] w-full transition group-hover:ring-2 group-hover:ring-sky-500 ${
            owned === 0 ? "opacity-60" : ""
          }`}
        />
        {owned > 0 && (
          <span className="absolute top-1 left-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black shadow">
            ×{owned}
          </span>
        )}
        {finishBadge && (
          <span className="absolute top-1 right-1 rounded-full bg-amber-500 px-1.5 text-[9px] font-bold text-black">
            {finishBadge}
          </span>
        )}
      </button>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onAdjust(-1)}
          disabled={owned === 0}
          className="h-6 w-6 rounded bg-stone-800 font-bold text-rose-400 hover:bg-stone-700 disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-5 text-center text-xs font-bold text-stone-200">{owned}</span>
        <button
          onClick={() => onAdjust(1)}
          className="h-6 w-6 rounded bg-stone-800 font-bold text-emerald-400 hover:bg-stone-700"
        >
          +
        </button>
        <span className="ml-auto text-[11px] font-semibold text-emerald-400">
          {price !== null ? `$${price.toFixed(2)}` : "—"}
        </span>
      </div>
    </div>
  );
});

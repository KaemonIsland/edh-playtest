"use client";

import { memo } from "react";
import type { ScryCard } from "@/types";
import { useDebouncedQty } from "@/lib/cards/useDebouncedQty";
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
  onAdjust: (delta: number) => void | Promise<void>;
}) {
  const { value, pending, busy, bump } = useDebouncedQty(owned, onAdjust);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-stone-800 bg-stone-950 p-2">
      <button onClick={onOpen} className="group relative text-left" title={card.name}>
        <CardImage
          card={card}
          className={`aspect-[5/7] w-full transition group-hover:ring-2 group-hover:ring-sky-500 ${
            value === 0 ? "opacity-60" : ""
          }`}
        />
        {value > 0 && (
          <span className="absolute top-1 left-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black shadow">
            ×{value}
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
          onClick={() => bump(-1)}
          disabled={busy || value === 0}
          className="h-6 w-6 rounded bg-stone-800 font-bold text-rose-400 hover:bg-stone-700 disabled:opacity-30"
        >
          −
        </button>
        <span
          className={`flex min-w-5 items-center justify-center text-xs font-bold ${
            pending ? "text-amber-300" : "text-stone-200"
          }`}
        >
          {busy ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-stone-400 border-t-transparent" />
          ) : (
            value
          )}
        </span>
        <button
          onClick={() => bump(1)}
          disabled={busy}
          className="h-6 w-6 rounded bg-stone-800 font-bold text-emerald-400 hover:bg-stone-700 disabled:opacity-40"
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

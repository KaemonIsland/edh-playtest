"use client";

import type { ScryCard } from "@/types";
import type { CardFinish } from "@/lib/repo";
import { priceOf } from "@/lib/cards/pricing";
import { useDebouncedQty } from "@/lib/cards/useDebouncedQty";
import { CardImage } from "@/components/cards/CardImage";

/**
 * A single printing as an add-to-collection tile: image, owned badge, set +
 * collector, nonfoil/foil prices, and NF/F quantity steppers. Used both in the
 * card modal's "All printings" grid and in card-search results, so a specific
 * variant can be added in one click. Steppers show a spinner while the write
 * is in flight (`onAdjust` may be async).
 */

const fmt = (v: number | null) => (v !== null ? `$${v.toFixed(2)}` : "—");

export function PrintingTile({
  card,
  ownedNonfoil,
  ownedFoil,
  selected,
  showName,
  showSetInfo = true,
  onOpen,
  onAdjust,
  deckQty,
  onAdjustDeck,
}: {
  card: ScryCard;
  ownedNonfoil: number;
  ownedFoil: number;
  /** Highlight as the currently-shown printing. */
  selected?: boolean;
  /** Show the card name above the set (for cross-card search results). */
  showName?: boolean;
  /** Show the set name + collector number line (off for same-set grids). */
  showSetInfo?: boolean;
  onOpen?: () => void;
  /** Collection steppers (NF/F). Omitted in deck-add mode. */
  onAdjust?: (finish: CardFinish, delta: number) => void | Promise<void>;
  /** Copies of this card already in the deck (deck-add mode). */
  deckQty?: number;
  /** Add/remove this printing to/from the deck. When set, replaces the NF/F
   * collection steppers with a single "In deck" stepper. */
  onAdjustDeck?: (delta: number) => void | Promise<void>;
}) {
  const owned = ownedNonfoil + ownedFoil;
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border bg-stone-900 p-2 ${
        selected ? "border-emerald-600" : owned > 0 ? "border-amber-700/60" : "border-stone-800"
      }`}
    >
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className="group relative text-left"
        title={onOpen ? `View ${card.name}` : card.name}
      >
        <CardImage
          card={card}
          className={`aspect-[5/7] w-full transition ${onOpen ? "group-hover:ring-2 group-hover:ring-sky-500" : ""} ${
            owned === 0 ? "opacity-60" : ""
          }`}
        />
        {owned > 0 && (
          <span className="absolute top-1 left-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black shadow">
            ×{owned}
          </span>
        )}
      </button>
      {showName && (
        <div className="truncate text-xs font-semibold text-stone-200" title={card.name}>
          {card.name}
        </div>
      )}
      {showSetInfo && (
        <div className="truncate text-[11px] text-stone-300" title={card.set_name}>
          {card.set_name ?? card.set?.toUpperCase() ?? "—"}
          {card.collector_number ? ` · #${card.collector_number}` : ""}
        </div>
      )}
      <div className="text-[10px] text-stone-500">
        NF {fmt(priceOf(card, "nonfoil"))} · F {fmt(priceOf(card, "foil"))}
      </div>
      {onAdjustDeck ? (
        <DeckStepper qty={deckQty ?? 0} onAdjust={onAdjustDeck} />
      ) : onAdjust ? (
        <div className="flex items-center justify-between gap-1">
          <FinishStepper label="NF" qty={ownedNonfoil} onAdjust={(d) => onAdjust("nonfoil", d)} />
          <FinishStepper label="F" qty={ownedFoil} onAdjust={(d) => onAdjust("foil", d)} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Single "In deck" stepper for the deck builder's search. Deck edits are
 * in-memory, so this updates instantly (no debounce/spinner). Shows "+ Add"
 * until the card is in the deck.
 */
function DeckStepper({
  qty,
  onAdjust,
}: {
  qty: number;
  onAdjust: (delta: number) => void | Promise<void>;
}) {
  if (qty === 0) {
    return (
      <button
        onClick={() => void onAdjust(1)}
        className="w-full rounded bg-emerald-700 py-1 text-[11px] font-bold text-white hover:bg-emerald-600"
      >
        + Add to deck
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] font-bold tracking-wide text-emerald-400 uppercase">In deck</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => void onAdjust(-1)}
          className="flex h-5 w-5 items-center justify-center rounded bg-stone-800 text-[11px] font-bold text-rose-400 hover:bg-stone-700"
        >
          −
        </button>
        <span className="flex w-5 items-center justify-center text-[11px] font-bold text-stone-200">
          {qty}
        </span>
        <button
          onClick={() => void onAdjust(1)}
          className="flex h-5 w-5 items-center justify-center rounded bg-stone-800 text-[11px] font-bold text-emerald-400 hover:bg-stone-700"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-stone-400 border-t-transparent align-middle" />
  );
}

/**
 * NF/F quantity stepper. Clicks update the count instantly and the DB write is
 * debounced (~300ms) so multiple adds collapse into one write; a spinner shows
 * while that write runs.
 */
function FinishStepper({
  label,
  qty,
  onAdjust,
}: {
  label: string;
  qty: number;
  onAdjust: (delta: number) => void | Promise<void>;
}) {
  const { value, pending, busy, bump } = useDebouncedQty(qty, onAdjust);
  return (
    <div className="flex items-center gap-0.5">
      <span className="w-4 text-[8px] font-bold text-stone-500">{label}</span>
      <button
        onClick={() => bump(-1)}
        disabled={busy || value === 0}
        className="flex h-5 w-5 items-center justify-center rounded bg-stone-800 text-[11px] font-bold text-rose-400 hover:bg-stone-700 disabled:opacity-30"
      >
        −
      </button>
      <span
        className={`flex w-5 items-center justify-center text-[11px] font-bold ${
          pending ? "text-amber-300" : "text-stone-200"
        }`}
      >
        {busy ? <Spinner /> : value}
      </span>
      <button
        onClick={() => bump(1)}
        disabled={busy}
        className="flex h-5 w-5 items-center justify-center rounded bg-stone-800 text-[11px] font-bold text-emerald-400 hover:bg-stone-700 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

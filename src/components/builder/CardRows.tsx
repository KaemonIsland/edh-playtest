"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ScryCard } from "@/types";
import type { LensEntry } from "@/lib/deck/stats";
import { CardImage } from "@/components/cards/CardImage";
import { ManaCost } from "@/components/cards/ManaCost";

/**
 * The two ways a deck entry renders in the builder — an image stack sliver or
 * a text row. Shared between the main category columns and the dock's boards
 * so Stacks/Text applies everywhere. Ghosts (Category-all lens) are click-only.
 */

export type ViewMode = "stacks" | "text";

/** Category chips shown after a card's name (its secondary roles). */
export function CategoryChips({ categories }: { categories: string[] }) {
  if (categories.length <= 1) return null;
  return (
    <span className="flex min-w-0 shrink gap-1 overflow-hidden">
      {categories.slice(1, 4).map((c) => (
        <span
          key={c}
          className="truncate rounded-full border border-sky-800/50 bg-sky-950/30 px-1.5 text-[8px] leading-4 font-semibold text-sky-300"
          title={`Also categorized: ${c}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

export function SwapsBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="shrink-0 rounded border border-violet-800/60 bg-violet-950/40 px-1 text-[9px] leading-4 font-bold text-violet-300"
      title={`${count} benched alternative${count === 1 ? "" : "s"} — open the card for Swaps`}
    >
      ⇄{count}
    </span>
  );
}

export function DropHint() {
  return (
    <div className="rounded border border-dashed border-stone-800 px-2 py-3 text-center text-[10px] text-stone-700">
      drop cards here
    </div>
  );
}

export function TextRow({
  le,
  owned,
  selected,
  onOpen,
  onToggleSelect,
}: {
  le: LensEntry;
  owned: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}) {
  const { entry, ghost, home } = le;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.card.id,
    disabled: ghost,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => (e.shiftKey && !ghost ? onToggleSelect() : onOpen())}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition ${
        ghost ? "cursor-pointer text-stone-400 opacity-70" : "cursor-grab text-stone-300"
      } ${selected ? "bg-emerald-950/40 ring-1 ring-emerald-600" : "hover:bg-stone-800"}`}
      style={{ opacity: isDragging ? 0.3 : undefined }}
      title={ghost ? `${entry.card.name} — home: ${home}` : undefined}
    >
      <span className="w-4 shrink-0 text-stone-600">{entry.quantity}</span>
      {!owned && !ghost && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          title="Not in your collection"
        />
      )}
      <span className="min-w-0 flex-1 truncate">{entry.card.name}</span>
      {ghost && home ? (
        <span className="shrink-0 text-[9px] text-stone-500 italic">· {home}</span>
      ) : (
        <>
          <CategoryChips categories={entry.categories} />
          <SwapsBadge count={entry.swaps?.length ?? 0} />
        </>
      )}
      <ManaCost cost={entry.card.mana_cost} size={11} className="shrink-0" />
    </button>
  );
}

/**
 * Archidekt-style stack: card images overlap via a negative top margin so only
 * a sliver of each shows. Hovering a card parts the stack — the next card slides
 * down (`[&:hover+*]:mt-0`), fully revealing the hovered one without covering its
 * neighbours. The first card never overlaps (`first:mt-0`).
 */
export function StackCard({
  le,
  owned,
  selected,
  onOpen,
  onToggleSelect,
}: {
  le: LensEntry;
  owned: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}) {
  const { entry, ghost, home } = le;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.card.id,
    disabled: ghost,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => (e.shiftKey && !ghost ? onToggleSelect() : onOpen())}
      className={`relative -mt-[120%] transition-[margin] duration-150 first:mt-0 hover:z-30 [&:hover+*]:mt-0 ${
        ghost ? "cursor-pointer opacity-70 saturate-50" : "cursor-grab"
      }`}
      style={{ opacity: isDragging ? 0.3 : undefined }}
      title={
        ghost
          ? `${entry.card.name} — home: ${home}`
          : owned
            ? entry.card.name
            : `${entry.card.name} — not in your collection`
      }
    >
      <CardImage
        card={entry.card}
        className={`w-full shadow-md shadow-black/60 hover:ring-2 hover:ring-stone-500 ${
          selected ? "ring-2 ring-emerald-500" : ""
        } ${ghost ? "ring-1 ring-stone-600" : ""}`}
      />
      {entry.quantity > 1 && (
        <span className="absolute top-1 left-1 z-10 rounded-full bg-black/80 px-1.5 text-[10px] font-bold text-white">
          ×{entry.quantity}
        </span>
      )}
      {ghost && home && (
        <span className="absolute bottom-1 left-1 z-10 rounded bg-black/80 px-1.5 text-[9px] text-stone-300 italic">
          · {home}
        </span>
      )}
      {!ghost && (
        <span className="absolute top-1 right-1 z-10 flex items-center gap-1">
          {(entry.swaps?.length ?? 0) > 0 && (
            <span
              className="rounded bg-black/80 px-1 text-[9px] font-bold text-violet-300 ring-1 ring-violet-800/60"
              title={`${entry.swaps!.length} benched alternative(s) — open the card for Swaps`}
            >
              ⇄{entry.swaps!.length}
            </span>
          )}
          {!owned && (
            <span
              className="h-2 w-2 rounded-full bg-amber-500 ring-1 ring-black"
              title="Not in your collection"
            />
          )}
        </span>
      )}
    </div>
  );
}

/** Either row type, picked by the active view. */
export function CardRow(props: {
  view: ViewMode;
  le: LensEntry;
  owned: boolean;
  selected: boolean;
  onOpen: (card: ScryCard) => void;
  onToggleSelect: (cardId: string) => void;
}) {
  const { view, le, owned, selected, onOpen, onToggleSelect } = props;
  const shared = {
    le,
    owned,
    selected,
    onOpen: () => onOpen(le.entry.card),
    onToggleSelect: () => onToggleSelect(le.entry.card.id),
  };
  return view === "text" ? <TextRow {...shared} /> : <StackCard {...shared} />;
}

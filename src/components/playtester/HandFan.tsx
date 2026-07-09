"use client";

import { memo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import type { CardInstance, ScryCard } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";
import { buildCardMenu } from "./cardMenu";

function HandCard({
  inst,
  card,
  index,
  total,
}: {
  inst: CardInstance;
  card?: ScryCard;
  index: number;
  total: number;
}) {
  const moveCard = useGameStore((s) => s.moveCard);
  const cardSize = useGameStore((s) => s.prefs.cardSize);
  const openMenu = useUiStore((s) => s.openMenu);
  const setPreview = useUiStore((s) => s.setPreview);
  const bottoming = useUiStore((s) => s.bottoming);
  const selected = useUiStore((s) => s.bottomingSelected.includes(inst.instanceId));
  const toggleBottomingCard = useUiStore((s) => s.toggleBottomingCard);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: inst.instanceId,
    data: { zone: "hand" },
    disabled: bottoming > 0,
  });

  // Hand cards render slightly larger than battlefield cards.
  const w = Math.round(cardSize * 1.1);
  const h = Math.round(w * 1.4);

  // Fan math: spread cards along an arc centred on the hand.
  const mid = (total - 1) / 2;
  const offset = index - mid;
  const rotate = offset * Math.min(5, 42 / Math.max(total, 1));
  const lift = -Math.abs(offset) * Math.min(6, 30 / Math.max(total, 1));

  return (
    <motion.div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      layout
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: lift, rotate, opacity: isDragging ? 0.3 : 1 }}
      whileHover={{ y: lift - 36, rotate: 0, scale: 1.12, zIndex: 30 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={`relative -ml-8 cursor-grab touch-none first:ml-0 ${selected ? "outline-3 outline-rose-500" : ""}`}
      style={{ width: w, height: h, zIndex: index }}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, buildCardMenu(inst.instanceId));
      }}
      onClick={() => {
        if (bottoming > 0) toggleBottomingCard(inst.instanceId);
      }}
      onDoubleClick={() => {
        if (bottoming === 0) moveCard(inst.instanceId, "battlefield");
      }}
      onMouseEnter={() => setPreview({ card, flipped: inst.flipped })}
      onMouseLeave={() => setPreview(null)}
    >
      <CardImage
        card={card}
        flipped={inst.flipped}
        className="h-full w-full rounded-md shadow-xl shadow-black/70 ring-1 ring-stone-700"
      />
    </motion.div>
  );
}

export const HandFan = memo(function HandFan() {
  const zoneOrder = useGameStore((s) => s.zoneOrder);
  const instances = useGameStore((s) => s.instances);
  const cards = useGameStore((s) => s.cards);
  const bottomCards = useGameStore((s) => s.bottomCards);
  const undo = useGameStore((s) => s.undo);
  const redo = useGameStore((s) => s.redo);
  const canUndo = useGameStore((s) => s.history.length > 0);
  const canRedo = useGameStore((s) => s.future.length > 0);

  const bottoming = useUiStore((s) => s.bottoming);
  const bottomingSelected = useUiStore((s) => s.bottomingSelected);
  const clearBottoming = useUiStore((s) => s.clearBottoming);
  const dragging = useUiStore((s) => s.dragging);
  const boardHover = useUiStore((s) => s.boardHover);

  const { setNodeRef, isOver } = useDroppable({ id: "hand" });
  const handIds = zoneOrder[PLAYER_ID]?.hand ?? [];

  // Keep the hand in place, but fade the fan so the battlefield reads through it:
  // while dragging (so you can place cards), or while hovering a board card that
  // may sit under the fan. Hovering the hand itself (isOver) keeps it solid.
  const fanOpacity = isOver ? 1 : dragging ? 0.3 : boardHover ? 0.45 : 1;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-3 pb-1">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (z)"
        className="pointer-events-auto mb-10 flex h-11 w-11 items-center justify-center rounded-full border border-stone-700 bg-stone-900/90 text-lg text-stone-300 shadow-lg transition hover:bg-stone-800 disabled:opacity-30"
      >
        ↺
      </button>

      <div
        ref={setNodeRef}
        className={`pointer-events-auto relative flex h-[100px] min-w-[260px] items-end justify-center overflow-visible rounded-t-xl px-6 transition-colors duration-150 ${
          isOver ? "bg-emerald-900/30" : ""
        }`}
      >
        {/* The drop target is only this ~100px box; the fan overflows above it
            without being part of the drop zone, so it doesn't cover the board. */}
        {dragging && (
          <div
            className={`pointer-events-none absolute inset-x-2 inset-y-1 z-30 flex items-center justify-center rounded-lg border-2 border-dashed text-[11px] font-bold tracking-wide uppercase transition ${
              isOver
                ? "border-emerald-500 bg-emerald-600/30 text-emerald-50"
                : "border-sky-700/60 bg-stone-950/70 text-sky-300/80"
            }`}
          >
            ↓ To hand
          </div>
        )}
        {bottoming > 0 && (
          <div className="absolute -top-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-rose-900/95 px-4 py-2 text-xs text-white shadow-xl">
            <span>
              Select {bottoming} card{bottoming === 1 ? "" : "s"} to put on the bottom (
              {bottomingSelected.length}/{bottoming})
            </span>
            <button
              disabled={bottomingSelected.length !== bottoming}
              onClick={() => {
                bottomCards(bottomingSelected);
                clearBottoming();
              }}
              className="rounded-full bg-white/90 px-3 py-0.5 font-semibold text-rose-900 disabled:opacity-40"
            >
              Bottom them
            </button>
            <button onClick={clearBottoming} className="text-rose-200 hover:text-white">
              Cancel
            </button>
          </div>
        )}
        <div
          className="flex items-end justify-center transition-opacity duration-150"
          style={{ opacity: fanOpacity }}
        >
          {handIds.map((id, i) => {
            const inst = instances[id];
            if (!inst) return null;
            return (
              <HandCard
                key={id}
                inst={inst}
                card={cards[inst.cardId]}
                index={i}
                total={handIds.length}
              />
            );
          })}
          {handIds.length === 0 && (
            <div className="pb-6 text-xs text-stone-600 select-none">Hand is empty</div>
          )}
        </div>
      </div>

      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (y)"
        className="pointer-events-auto mb-10 flex h-11 w-11 items-center justify-center rounded-full border border-stone-700 bg-stone-900/90 text-lg text-stone-300 shadow-lg transition hover:bg-stone-800 disabled:opacity-30"
      >
        ↻
      </button>
    </div>
  );
});

"use client";

import { memo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import type { CardInstance, ScryCard } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";
import { buildCardMenu } from "./cardMenu";

const HAND_CARD_W = 110;
const HAND_CARD_H = 154;

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
      style={{ width: HAND_CARD_W, height: HAND_CARD_H, zIndex: index }}
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

  const { setNodeRef, isOver } = useDroppable({ id: "hand" });
  const handIds = zoneOrder[PLAYER_ID]?.hand ?? [];

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
        className={`pointer-events-auto flex min-h-[120px] min-w-[200px] items-end justify-center rounded-t-xl px-6 pt-8 transition-colors ${
          isOver ? "bg-emerald-900/20" : ""
        }`}
      >
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

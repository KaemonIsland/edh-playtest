"use client";

import { memo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import type { CardInstance, ScryCard } from "@/types";
import { useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage, CARD_H, CARD_W } from "@/components/cards/CardImage";
import { buildCardMenu } from "./cardMenu";

interface Props {
  inst: CardInstance;
  card?: ScryCard;
  fallbackIndex: number;
  sick: boolean;
}

export const BattlefieldCard = memo(function BattlefieldCard({
  inst,
  card,
  fallbackIndex,
  sick,
}: Props) {
  const toggleTap = useGameStore((s) => s.toggleTap);
  const attachAction = useGameStore((s) => s.attach);
  const instances = useGameStore((s) => s.instances);
  const cards = useGameStore((s) => s.cards);
  const openMenu = useUiStore((s) => s.openMenu);
  const setPreview = useUiStore((s) => s.setPreview);
  const attachSource = useUiStore((s) => s.attachSource);
  const setAttachSource = useUiStore((s) => s.setAttachSource);
  const longPress = useRef<number | null>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: inst.instanceId,
    data: { zone: "battlefield" },
  });

  const x = inst.position?.x ?? 24 + (fallbackIndex % 7) * (CARD_W + 14);
  const y = inst.position?.y ?? 24 + Math.floor(fallbackIndex / 7) * (CARD_H + 18);

  const openContext = (cx: number, cy: number) => {
    openMenu(cx, cy, buildCardMenu(inst.instanceId));
  };

  const isAttachTarget = attachSource !== null && attachSource !== inst.instanceId;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute touch-none"
      style={{ left: x, top: y, zIndex: isDragging ? 50 : inst.tapped ? 1 : 2, opacity: isDragging ? 0.3 : 1 }}
      onContextMenu={(e) => {
        e.preventDefault();
        openContext(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") {
          longPress.current = window.setTimeout(() => {
            if (!useUiStore.getState().dragging) openContext(e.clientX, e.clientY);
          }, 550);
        }
      }}
      onPointerUp={() => {
        if (longPress.current) window.clearTimeout(longPress.current);
      }}
      onPointerMove={() => {
        if (longPress.current) window.clearTimeout(longPress.current);
      }}
      onClick={(e) => {
        if (attachSource) {
          if (attachSource !== inst.instanceId) attachAction(attachSource, inst.instanceId);
          setAttachSource(null);
          e.stopPropagation();
        }
      }}
      onDoubleClick={() => toggleTap(inst.instanceId)}
      onMouseEnter={() => setPreview({ card, tokenSpec: inst.tokenSpec, flipped: inst.flipped })}
      onMouseLeave={() => setPreview(null)}
    >
      {/* Attachments fan out beneath the host card and move with it. */}
      {inst.attachments.map((id, i) => {
        const child = instances[id];
        if (!child) return null;
        return (
          <motion.div
            key={id}
            className="absolute"
            style={{ top: (i + 1) * 26, left: (i + 1) * 8, zIndex: -1 - i }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openMenu(e.clientX, e.clientY, buildCardMenu(id));
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setPreview({ card: cards[child.cardId], tokenSpec: child.tokenSpec, flipped: child.flipped });
            }}
          >
            <CardImage
              card={cards[child.cardId]}
              tokenSpec={child.tokenSpec}
              flipped={child.flipped}
              faceDown={child.faceDown}
              className="h-[140px] w-[100px] ring-1 ring-stone-700"
            />
          </motion.div>
        );
      })}

      <motion.div
        animate={{ rotate: inst.tapped ? 90 : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className={`relative rounded-[7%] ${
          isAttachTarget ? "ring-2 ring-emerald-400" : ""
        } ${sick ? "ring-1 ring-amber-500/70" : ""}`}
        style={{ width: CARD_W, height: CARD_H }}
      >
        <CardImage
          card={card}
          tokenSpec={inst.tokenSpec}
          flipped={inst.flipped}
          faceDown={inst.faceDown}
          className="h-full w-full shadow-lg shadow-black/60"
        />
        {sick && (
          <span
            title="Summoning sick (entered this turn)"
            className="absolute -top-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] text-black"
          >
            💤
          </span>
        )}
        {inst.isToken && (
          <span className="absolute top-0.5 right-0.5 rounded bg-black/70 px-1 text-[8px] text-stone-300">
            T
          </span>
        )}
        {Object.entries(inst.counters).map(([name, count], i) => (
          <span
            key={name}
            className="absolute right-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow"
            style={{ bottom: 2 + i * 18 }}
            title={`${name} counters`}
          >
            {name === "+1/+1" ? `+${count}/+${count}` : `${name}: ${count}`}
          </span>
        ))}
      </motion.div>
    </div>
  );
});

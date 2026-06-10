"use client";

import { useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { PLAYER_ID, hasSummoningSickness, useGameStore } from "@/lib/game/store";
import { justFinishedDrag, useUiStore } from "@/lib/game/uiStore";
import { BattlefieldCard } from "./BattlefieldCard";
import { buildBattlefieldMenu } from "./cardMenu";

interface Marquee {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

function marqueeRect(m: Marquee) {
  return {
    left: Math.min(m.startX, m.x),
    top: Math.min(m.startY, m.y),
    width: Math.abs(m.x - m.startX),
    height: Math.abs(m.y - m.startY),
  };
}

export function Battlefield() {
  const zoneOrder = useGameStore((s) => s.zoneOrder);
  const instances = useGameStore((s) => s.instances);
  const cards = useGameStore((s) => s.cards);
  const turn = useGameStore((s) => s.turn);
  const attachSource = useUiStore((s) => s.attachSource);
  const setAttachSource = useUiStore((s) => s.setAttachSource);
  const selected = useUiStore((s) => s.selected);
  const setSelected = useUiStore((s) => s.setSelected);
  const openMenu = useUiStore((s) => s.openMenu);

  const { setNodeRef, isOver } = useDroppable({ id: "battlefield" });
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // A click event trails every marquee drag; remember when one ended so the
  // click handler doesn't instantly clear the fresh selection.
  const marqueeEndAt = useRef(0);
  const ids = zoneOrder[PLAYER_ID]?.battlefield ?? [];

  // Marquee select: drag on empty battlefield space draws a selection box.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-bf-card]")) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMarquee({ startX: x, startY: y, x, y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!marquee) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMarquee({ ...marquee, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onPointerUp = () => {
    if (!marquee) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    const box = marqueeRect(marquee);
    if (rect && (box.width > 8 || box.height > 8)) {
      // Intersect against live DOM rects so taps/rotation/size are accounted for.
      const hits: string[] = [];
      surfaceRef.current
        ?.querySelectorAll<HTMLElement>("[data-bf-card]")
        .forEach((el) => {
          const id = el.dataset.instanceId;
          if (!id) return;
          const r = el.getBoundingClientRect();
          const cl = r.left - rect.left;
          const ct = r.top - rect.top;
          const overlaps =
            cl < box.left + box.width &&
            cl + r.width > box.left &&
            ct < box.top + box.height &&
            ct + r.height > box.top;
          if (overlaps) hits.push(id);
        });
      setSelected(hits);
      marqueeEndAt.current = Date.now();
    }
    setMarquee(null);
  };

  return (
    <div
      id="battlefield-surface"
      ref={(el) => {
        setNodeRef(el);
        surfaceRef.current = el;
      }}
      className={`relative h-full w-full overflow-hidden rounded-lg border transition-colors ${
        isOver ? "border-emerald-600/60 bg-stone-950/80" : "border-stone-800/80 bg-[#0c0c0e]"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 120%, rgba(60,60,80,0.25), transparent 70%)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-bf-card]")) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY, buildBattlefieldMenu());
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-bf-card]")) return;
        if (justFinishedDrag() || Date.now() - marqueeEndAt.current < 200) return;
        if (attachSource) setAttachSource(null);
        if (selected.length > 0) setSelected([]);
      }}
    >
      {attachSource && (
        <div className="absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-1 text-xs text-white shadow">
          Click a card to attach to — click the battlefield to cancel
        </div>
      )}
      {selected.length > 1 && (
        <div className="absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-sky-800 px-4 py-1 text-xs text-white shadow">
          {selected.length} selected — drag one to move all, click one to tap all
        </div>
      )}
      {ids.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-700 select-none">
          Drag cards here to play them
        </div>
      )}
      {ids.map((id, i) => {
        const inst = instances[id];
        if (!inst || inst.attachedTo) return null;
        return (
          <BattlefieldCard
            key={id}
            inst={inst}
            card={cards[inst.cardId]}
            fallbackIndex={i}
            sick={
              inst.enteredOnTurn === turn &&
              /\bCreature\b/.test(inst.tokenSpec?.typeLine ?? cards[inst.cardId]?.type_line ?? "")
            }
          />
        );
      })}
      {marquee && (
        <div
          className="pointer-events-none absolute z-40 border border-sky-400/80 bg-sky-400/10"
          style={marqueeRect(marquee)}
        />
      )}
    </div>
  );
}

export { hasSummoningSickness };

"use client";

import { useDroppable } from "@dnd-kit/core";
import { PLAYER_ID, hasSummoningSickness, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { BattlefieldCard } from "./BattlefieldCard";

export function Battlefield() {
  const zoneOrder = useGameStore((s) => s.zoneOrder);
  const instances = useGameStore((s) => s.instances);
  const cards = useGameStore((s) => s.cards);
  const turn = useGameStore((s) => s.turn);
  const attachSource = useUiStore((s) => s.attachSource);
  const setAttachSource = useUiStore((s) => s.setAttachSource);

  const { setNodeRef, isOver } = useDroppable({ id: "battlefield" });
  const ids = zoneOrder[PLAYER_ID]?.battlefield ?? [];

  return (
    <div
      id="battlefield-surface"
      ref={setNodeRef}
      className={`relative h-full w-full overflow-hidden rounded-lg border transition-colors ${
        isOver ? "border-emerald-600/60 bg-stone-950/80" : "border-stone-800/80 bg-[#0c0c0e]"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 120%, rgba(60,60,80,0.25), transparent 70%)",
      }}
      onClick={() => {
        if (attachSource) setAttachSource(null);
      }}
    >
      {attachSource && (
        <div className="absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-1 text-xs text-white shadow">
          Click a card to attach to — click the battlefield to cancel
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
    </div>
  );
}

export { hasSummoningSickness };

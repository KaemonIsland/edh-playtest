"use client";

import { useMemo, useState } from "react";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";
import { Modal } from "./Modal";

type Dest = "top" | "bottom" | "graveyard";

/** Scry / surveil: look at the top N, reorder the keeps, bin the rest. */
export function ScryModal({ count, surveil }: { count: number; surveil: boolean }) {
  const g = useGameStore();
  const closeModal = useUiStore((s) => s.closeModal);

  const topIds = useMemo(
    () => (g.zoneOrder[PLAYER_ID]?.library ?? []).slice(0, count),
    // capture once on open — the library doesn't change while the modal is up
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [dest, setDest] = useState<Record<string, Dest>>(
    Object.fromEntries(topIds.map((id) => [id, "top" as Dest])),
  );
  const [topOrder, setTopOrder] = useState<string[]>(topIds);

  const setCardDest = (id: string, d: Dest) => {
    setDest((prev) => ({ ...prev, [id]: d }));
    setTopOrder((prev) => {
      const without = prev.filter((x) => x !== id);
      return d === "top" ? [...without, id] : without;
    });
  };

  const moveInTop = (id: string, dir: -1 | 1) => {
    setTopOrder((prev) => {
      const idx = prev.indexOf(id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  };

  const confirm = () => {
    const toTop = topOrder;
    const toBottom = topIds.filter((id) => dest[id] === "bottom");
    const toGraveyard = topIds.filter((id) => dest[id] === "graveyard");
    g.resolveTopCards(toTop, toBottom, toGraveyard);
    closeModal();
  };

  return (
    <Modal title={`${surveil ? "Surveil" : "Scry"} ${count}`} wide>
      <p className="mb-3 text-[11px] text-stone-500">
        Cards staying on top resolve in the order shown (first = topmost). Use ◀ ▶ to reorder.
      </p>
      <div className="flex flex-wrap gap-3">
        {topIds.map((id) => {
          const inst = g.instances[id];
          if (!inst) return null;
          const card = g.cards[inst.cardId];
          const d = dest[id] ?? "top";
          const topIdx = topOrder.indexOf(id);
          return (
            <div key={id} className="flex w-32 flex-col gap-1.5">
              <div className="relative">
                <CardImage card={card} flipped={inst.flipped} className="aspect-[5/7] w-full" />
                {d === "top" && (
                  <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                    {topIdx + 1}
                  </span>
                )}
              </div>
              {d === "top" && (
                <div className="flex justify-center gap-1">
                  <button onClick={() => moveInTop(id, -1)} className="rounded bg-stone-800 px-2 text-xs text-stone-300 hover:bg-stone-700">◀</button>
                  <button onClick={() => moveInTop(id, 1)} className="rounded bg-stone-800 px-2 text-xs text-stone-300 hover:bg-stone-700">▶</button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-1">
                <DestBtn active={d === "top"} onClick={() => setCardDest(id, "top")}>Keep on top</DestBtn>
                <DestBtn active={d === "bottom"} onClick={() => setCardDest(id, "bottom")}>Bottom</DestBtn>
                {surveil && (
                  <DestBtn active={d === "graveyard"} onClick={() => setCardDest(id, "graveyard")}>
                    Graveyard
                  </DestBtn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={confirm}
          className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}

function DestBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-[10px] font-semibold transition ${
        active ? "bg-emerald-700 text-white" : "bg-stone-800 text-stone-400 hover:bg-stone-700"
      }`}
    >
      {children}
    </button>
  );
}

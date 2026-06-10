"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/game/store";
import { Modal } from "./Modal";

const DICE = [4, 6, 8, 10, 12, 20];

export function DicePanel() {
  const rollDie = useGameStore((s) => s.rollDie);
  const flipCoin = useGameStore((s) => s.flipCoin);
  const [results, setResults] = useState<string[]>([]);

  const push = (label: string) => setResults((prev) => [label, ...prev].slice(0, 12));

  return (
    <Modal title="Dice & coins">
      <div className="grid grid-cols-3 gap-2">
        {DICE.map((d) => (
          <button
            key={d}
            onClick={() => push(`d${d} → ${rollDie(d)}`)}
            className="rounded-lg border border-stone-700 bg-stone-900 py-3 text-sm font-bold text-stone-200 transition hover:bg-stone-800"
          >
            d{d}
          </button>
        ))}
        <button
          onClick={() => push(`coin → ${flipCoin()}`)}
          className="col-span-3 rounded-lg border border-amber-800/60 bg-stone-900 py-3 text-sm font-bold text-amber-400 transition hover:bg-stone-800"
        >
          🪙 Flip a coin
        </button>
      </div>
      {results.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
            Results (also in the action log)
          </div>
          <div className="flex flex-col gap-1">
            {results.map((r, i) => (
              <div
                key={`${r}-${i}`}
                className={`rounded bg-stone-900 px-3 py-1 text-xs ${i === 0 ? "font-bold text-emerald-300" : "text-stone-400"}`}
              >
                {r}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

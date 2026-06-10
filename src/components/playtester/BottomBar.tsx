"use client";

import type { ManaColor } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";

const MANA_STYLE: Record<ManaColor, string> = {
  W: "bg-amber-100 text-stone-900",
  U: "bg-sky-500 text-white",
  B: "bg-stone-700 text-stone-100",
  R: "bg-red-600 text-white",
  G: "bg-green-600 text-white",
  C: "bg-stone-400 text-stone-900",
};

function Tracker({
  label,
  value,
  onDelta,
  onSet,
  accent = "text-stone-100",
}: {
  label: string;
  value: number;
  onDelta: (d: number) => void;
  onSet?: (v: number) => void;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-stone-900 px-2 py-1">
      <span className="text-[10px] tracking-wide text-stone-500 uppercase">{label}</span>
      <button
        onClick={() => onDelta(-1)}
        className="h-6 w-6 rounded text-stone-400 hover:bg-stone-800"
      >
        −
      </button>
      <button
        className={`min-w-7 text-center text-sm font-bold ${accent}`}
        title={onSet ? "Click to set" : undefined}
        onClick={() => {
          if (!onSet) return;
          const raw = window.prompt(`Set ${label}:`, String(value));
          if (raw === null) return;
          const n = parseInt(raw, 10);
          if (Number.isFinite(n)) onSet(n);
        }}
      >
        {value}
      </button>
      <button
        onClick={() => onDelta(1)}
        className="h-6 w-6 rounded text-stone-400 hover:bg-stone-800"
      >
        +
      </button>
    </div>
  );
}

export function BottomBar() {
  const g = useGameStore();
  const openModal = useUiStore((s) => s.openModal);
  const player = g.players[PLAYER_ID];
  if (!player) return null;

  return (
    <footer className="z-30 flex h-14 items-center gap-2 overflow-x-auto border-t border-stone-800 bg-stone-950 px-3">
      <Tracker
        label="Life"
        value={player.life}
        accent={player.life <= 10 ? "text-red-400" : "text-emerald-300"}
        onDelta={(d) => g.addLife(PLAYER_ID, d)}
        onSet={(v) => g.setLife(PLAYER_ID, v)}
      />
      <Tracker
        label="Psn"
        value={player.poison}
        accent={player.poison >= 7 ? "text-fuchsia-400" : "text-stone-100"}
        onDelta={(d) => g.addTracker(PLAYER_ID, "poison", d)}
      />
      <Tracker
        label="Engy"
        value={player.energy}
        onDelta={(d) => g.addTracker(PLAYER_ID, "energy", d)}
      />
      <Tracker
        label="Exp"
        value={player.experience}
        onDelta={(d) => g.addTracker(PLAYER_ID, "experience", d)}
      />

      {/* Mana pool: click +1, right-click −1 */}
      <div className="flex items-center gap-1 rounded-lg bg-stone-900 px-2 py-1">
        {(Object.keys(MANA_STYLE) as ManaColor[]).map((c) => (
          <button
            key={c}
            title={`${c} mana — click +1, right-click −1`}
            onClick={() => g.addMana(PLAYER_ID, c, 1)}
            onContextMenu={(e) => {
              e.preventDefault();
              g.addMana(PLAYER_ID, c, -1);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-inner transition hover:scale-110 ${MANA_STYLE[c]} ${
              player.manaPool[c] === 0 ? "opacity-40" : ""
            }`}
          >
            {player.manaPool[c] > 0 ? player.manaPool[c] : c}
          </button>
        ))}
        <button
          onClick={() => g.clearMana(PLAYER_ID)}
          className="ml-1 rounded px-1.5 py-1 text-[10px] text-stone-500 uppercase hover:bg-stone-800 hover:text-stone-300"
          title="Empty mana pool"
        >
          clear
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => openModal({ kind: "dice" })}
          className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
        >
          🎲 Dice & coins
        </button>
        <button
          onClick={() => openModal({ kind: "settings" })}
          className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
        >
          ⚙ Settings
        </button>
        <button
          onClick={() => g.nextTurn()}
          className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-600"
          title="Untap all + draw for turn (n)"
        >
          Next turn ▸
        </button>
      </div>
    </footer>
  );
}

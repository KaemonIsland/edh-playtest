"use client";

import { useRouter } from "next/navigation";
import { PHASES, type Phase } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";

const PHASE_LABEL: Record<Phase, string> = {
  untap: "Untap",
  upkeep: "Upkeep",
  draw: "Draw",
  main1: "Main 1",
  combat: "Combat",
  main2: "Main 2",
  end: "End",
};

export function TopBar() {
  const router = useRouter();
  const g = useGameStore();
  const openMenu = useUiStore((s) => s.openMenu);
  const openModal = useUiStore((s) => s.openModal);
  const startBottoming = useUiStore((s) => s.startBottoming);

  const mulligans = g.players[PLAYER_ID]?.mulligans ?? 0;

  const actionsMenu = (): MenuItem[] => [
    {
      label: "Restart game (reshuffle & redraw)",
      onClick: () => g.startGame(),
    },
    { label: `Mulligan (draw new 7)${mulligans ? ` — taken ${mulligans}` : ""}`, onClick: () => g.mulligan() },
    {
      label: `Keep & bottom ${mulligans} card${mulligans === 1 ? "" : "s"}`,
      disabled: mulligans === 0,
      onClick: () => startBottoming(mulligans),
    },
    { label: "", separator: true },
    { label: "Save / load snapshots…", onClick: () => openModal({ kind: "snapshots" }) },
    { label: "Settings…", onClick: () => openModal({ kind: "settings" }) },
    { label: "", separator: true },
    { label: "Import a different deck", danger: true, onClick: () => router.push("/") },
  ];

  return (
    <header className="flex h-12 items-center gap-2 border-b border-stone-800 bg-stone-950 px-3">
      <button
        onClick={(e) => openMenu(e.clientX, e.clientY + 12, actionsMenu())}
        className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
      >
        Playtester actions ▾
      </button>
      <button
        onClick={() => openModal({ kind: "keybinds" })}
        className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
        title="Keyboard shortcuts (?)"
      >
        Keybinds
      </button>

      <div className="ml-2 truncate text-sm font-medium text-stone-400">
        {g.deck?.name ?? "Untitled deck"}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {g.prefs.showPhaseStepper && (
          <div className="hidden items-center gap-0.5 lg:flex">
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => g.setPhase(p)}
                className={`rounded px-2 py-1 text-[10px] font-semibold tracking-wide uppercase transition ${
                  g.phase === p
                    ? "bg-emerald-700 text-white"
                    : "text-stone-500 hover:bg-stone-800 hover:text-stone-300"
                }`}
              >
                {PHASE_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        <span className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-bold text-stone-300">
          Turn {g.turn}
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href).catch(() => {});
            g.logNote("Copied playtester link to clipboard.");
          }}
          className="rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
        >
          Share
        </button>
      </div>
    </header>
  );
}

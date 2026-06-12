"use client";

import { useRouter } from "next/navigation";
import { PHASES, type Phase } from "@/types";
import { isBotId, PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useBotStore } from "@/lib/game/botStore";
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
  const viewedOpponent = useUiStore((s) => s.viewedOpponent);
  const setViewedOpponent = useUiStore((s) => s.setViewedOpponent);
  const setOpponentCollapsed = useUiStore((s) => s.setOpponentCollapsed);

  const mulligans = g.players[PLAYER_ID]?.mulligans ?? 0;
  const botIds = g.playerOrder.filter(isBotId);

  const actionsMenu = (): MenuItem[] => [
    {
      label: "Restart game (reshuffle & redraw)",
      onClick: () => {
        useBotStore.getState().reset();
        g.startGame();
      },
    },
    { label: `Mulligan (draw new 7)${mulligans ? ` — taken ${mulligans}` : ""}`, onClick: () => g.mulligan() },
    {
      label: `Keep & bottom ${mulligans} card${mulligans === 1 ? "" : "s"}`,
      disabled: mulligans === 0,
      onClick: () => startBottoming(mulligans),
    },
    { label: "", separator: true },
    { label: "End & log this game…", onClick: () => openModal({ kind: "loggame" }) },
    {
      label: "View deck showcase",
      onClick: async () => {
        if (!g.deck) return;
        const { getRepo } = await import("@/lib/repo");
        await getRepo().saveDeck(g.deck);
        router.push(`/d/${g.deck.id}`);
      },
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

      <div className="ml-2 max-w-44 truncate text-sm font-medium text-stone-400">
        {g.deck?.name ?? "Untitled deck"}
      </div>

      {/* Players: you + opponent tabs. Green dot = whose turn it is;
          clicking an opponent shows their board ("current opponent"). */}
      {botIds.length > 0 && (
        <div className="ml-2 flex items-center gap-1 overflow-x-auto">
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              g.activePlayerId === PLAYER_ID
                ? "bg-emerald-900/60 text-emerald-200 ring-1 ring-emerald-600"
                : "bg-stone-900 text-stone-400"
            }`}
          >
            {g.activePlayerId === PLAYER_ID && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
            You
          </span>
          {botIds.map((id) => {
            const isTurn = g.activePlayerId === id;
            const isViewed = viewedOpponent === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setViewedOpponent(id);
                  setOpponentCollapsed(false);
                }}
                title={`Show ${g.players[id]?.name}'s board`}
                className={`flex max-w-36 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  isTurn
                    ? "bg-rose-900/70 text-rose-200 ring-1 ring-rose-500"
                    : isViewed
                      ? "bg-stone-800 text-stone-200 ring-1 ring-stone-500"
                      : "bg-stone-900 text-stone-500 hover:text-stone-300"
                }`}
              >
                {isTurn && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                <span className="truncate">🤖 {g.players[id]?.name ?? id}</span>
              </button>
            );
          })}
        </div>
      )}

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

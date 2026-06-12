"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { isBotId, PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { getRepo, type GameResult } from "@/lib/repo";
import { Modal } from "./Modal";

/**
 * Save the current playtest as a game-log entry on the deck's showcase.
 * Pre-fills from game state and suggests notable plays from the typed
 * action-log events.
 */
export function LogGameModal() {
  const g = useGameStore();
  const closeModal = useUiStore((s) => s.closeModal);

  const suggestions = useMemo(() => {
    const picks: string[] = [];
    for (const entry of g.log) {
      const e = entry.event;
      if (entry.playerId !== PLAYER_ID) continue;
      if (e.type === "token" && /Created (\d+)x/.test(e.message)) {
        const n = parseInt(e.message.match(/Created (\d+)x/)?.[1] ?? "0", 10);
        if (n >= 3) picks.push(`T${entry.turn}: ${e.message}`);
      } else if (e.type === "life" && Math.abs(e.delta) >= 10) {
        picks.push(`T${entry.turn}: ${e.message}`);
      } else if (e.type === "draw" && e.count >= 4) {
        picks.push(`T${entry.turn}: ${e.message}`);
      }
    }
    return picks.slice(-3);
  }, [g.log]);

  const [result, setResult] = useState<GameResult>("W");
  const [podSize, setPodSize] = useState(g.playerOrder.length > 1 ? g.playerOrder.length : 4);
  const [opponents, setOpponents] = useState(
    g.botDecks.map((d) => d.commanders[0]?.name ?? d.name).join(", "),
  );
  const [turns, setTurns] = useState(String(g.turn));
  const [mulligans, setMulligans] = useState(String(g.players[PLAYER_ID]?.mulligans ?? 0));
  const [notablePlays, setNotablePlays] = useState(suggestions.join("\n"));
  const [busy, setBusy] = useState(false);
  const [savedDeckId, setSavedDeckId] = useState<string | null>(null);

  if (!g.deck) return null;
  const deck = g.deck;

  const submit = async () => {
    setBusy(true);
    try {
      const repo = getRepo();
      // Make sure the deck exists in the showcase library, then log the game.
      await repo.saveDeck(deck);
      await repo.addGame({
        deckId: deck.id,
        date: Date.now(),
        podSize,
        opponents: opponents.split(",").map((s) => s.trim()).filter(Boolean),
        result,
        turns: parseInt(turns, 10) || undefined,
        mulligans: Number.isFinite(parseInt(mulligans, 10)) ? parseInt(mulligans, 10) : undefined,
        notablePlays: notablePlays.trim() || undefined,
        isPlaytest: g.playerOrder.some(isBotId) || g.playerOrder.length === 1,
      });
      setSavedDeckId(deck.id);
    } finally {
      setBusy(false);
    }
  };

  if (savedDeckId) {
    return (
      <Modal title="Game logged">
        <p className="text-sm text-stone-300">
          Saved to <span className="font-bold">{deck.name}</span>’s game history (flagged as a
          playtest).
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href={`/d/${savedDeckId}`}
            className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"
            onClick={closeModal}
          >
            View deck showcase →
          </Link>
          <button
            onClick={closeModal}
            className="rounded-md bg-stone-800 px-4 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-700"
          >
            Keep playing
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Log this game">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-stone-900 p-0.5">
          {(["W", "L", "D"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setResult(r)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                result === r
                  ? r === "W"
                    ? "bg-emerald-700 text-white"
                    : r === "L"
                      ? "bg-rose-800 text-white"
                      : "bg-stone-600 text-white"
                  : "text-stone-500"
              }`}
            >
              {r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-stone-400">
          Pod
          <input
            type="number"
            min={1}
            max={6}
            value={podSize}
            onChange={(e) => setPodSize(parseInt(e.target.value, 10) || 4)}
            className="w-14 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 outline-none focus:border-emerald-600"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-stone-400">
          Turns
          <input
            value={turns}
            onChange={(e) => setTurns(e.target.value)}
            className="w-14 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 outline-none focus:border-emerald-600"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-stone-400">
          Mulls
          <input
            value={mulligans}
            onChange={(e) => setMulligans(e.target.value)}
            className="w-12 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 outline-none focus:border-emerald-600"
          />
        </label>
      </div>
      <input
        value={opponents}
        onChange={(e) => setOpponents(e.target.value)}
        placeholder="Opposing commanders, comma-separated"
        className="mb-2 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
      />
      <label className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
        Notable plays {suggestions.length > 0 && "(suggested from the action log)"}
      </label>
      <textarea
        value={notablePlays}
        onChange={(e) => setNotablePlays(e.target.value)}
        rows={3}
        placeholder="Play of the game…"
        className="mt-1 mb-3 w-full rounded-md border border-stone-700 bg-stone-900 p-2 text-xs outline-none focus:border-emerald-600"
      />
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save game log"}
      </button>
    </Modal>
  );
}

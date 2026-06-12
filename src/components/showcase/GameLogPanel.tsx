"use client";

import { useCallback, useEffect, useState } from "react";
import { computeGameStats, getRepo, type GameRecord, type GameResult } from "@/lib/repo";

export function GameLogPanel({ deckId }: { deckId: string }) {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<GameResult>("W");
  const [podSize, setPodSize] = useState(4);
  const [opponents, setOpponents] = useState("");
  const [turns, setTurns] = useState("");
  const [mulligans, setMulligans] = useState("");
  const [notablePlays, setNotablePlays] = useState("");

  const refresh = useCallback(async () => {
    setGames(await getRepo().listGames(deckId));
  }, [deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = computeGameStats(games);

  const submit = async () => {
    setBusy(true);
    try {
      await getRepo().addGame({
        deckId,
        date: Date.now(),
        podSize,
        opponents: opponents.split(",").map((s) => s.trim()).filter(Boolean),
        result,
        turns: turns ? parseInt(turns, 10) : undefined,
        mulligans: mulligans ? parseInt(mulligans, 10) : undefined,
        notablePlays: notablePlays.trim() || undefined,
        isPlaytest: false,
      });
      setOpponents("");
      setTurns("");
      setMulligans("");
      setNotablePlays("");
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setAdding(!adding)}
          className="rounded-md bg-stone-800 px-3 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700"
        >
          {adding ? "Cancel" : "+ Log a game"}
        </button>
      </div>

      {/* Aggregates */}
      {stats.total > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-stone-900 p-2.5">
            <div className="text-[10px] tracking-wide text-stone-500 uppercase">Win rate</div>
            <div className="text-lg font-bold text-emerald-300">
              {stats.winRate !== null ? `${Math.round(stats.winRate * 100)}%` : "—"}
              <span className="ml-1 text-[10px] font-normal text-stone-500">
                {stats.wins}W {stats.losses}L {stats.draws}D
              </span>
            </div>
          </div>
          <div className="rounded-md bg-stone-900 p-2.5">
            <div className="text-[10px] tracking-wide text-stone-500 uppercase">By pod size</div>
            <div className="text-xs font-semibold text-stone-200">
              {stats.winRateByPod.map((p) => (
                <span key={p.podSize} className="mr-2">
                  {p.podSize}p: {Math.round(p.winRate * 100)}%
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-md bg-stone-900 p-2.5">
            <div className="text-[10px] tracking-wide text-stone-500 uppercase">Avg length</div>
            <div className="text-lg font-bold text-stone-100">
              {stats.avgTurns !== null ? `${stats.avgTurns.toFixed(1)} turns` : "—"}
            </div>
          </div>
          <div className="rounded-md bg-stone-900 p-2.5">
            <div className="text-[10px] tracking-wide text-stone-500 uppercase">Avg mulligans</div>
            <div className="text-lg font-bold text-stone-100">
              {stats.mulliganRate !== null ? stats.mulliganRate.toFixed(1) : "—"}
            </div>
          </div>
        </div>
      )}
      {stats.mostFaced.length > 0 && (
        <p className="mb-3 text-[11px] text-stone-500">
          Most faced:{" "}
          {stats.mostFaced.map((f) => `${f.name} (${f.count})`).join(", ")}
        </p>
      )}

      {/* Add form */}
      {adding && (
        <div className="mb-4 rounded-lg border border-stone-800 bg-stone-900/60 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-stone-950 p-0.5">
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
                min={2}
                max={6}
                value={podSize}
                onChange={(e) => setPodSize(parseInt(e.target.value, 10) || 4)}
                className="w-14 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 outline-none focus:border-emerald-600"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-stone-400">
              Turns
              <input
                value={turns}
                onChange={(e) => setTurns(e.target.value)}
                placeholder="—"
                className="w-14 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 outline-none focus:border-emerald-600"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-stone-400">
              Mulls
              <input
                value={mulligans}
                onChange={(e) => setMulligans(e.target.value)}
                placeholder="0"
                className="w-12 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 outline-none focus:border-emerald-600"
              />
            </label>
          </div>
          <input
            value={opponents}
            onChange={(e) => setOpponents(e.target.value)}
            placeholder="Opposing commanders, comma-separated (e.g. Atraxa, Krenko, Talrand)"
            className="mb-2 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
          />
          <textarea
            value={notablePlays}
            onChange={(e) => setNotablePlays(e.target.value)}
            rows={2}
            placeholder="Play of the game / notable plays…"
            className="mb-2 w-full rounded-md border border-stone-700 bg-stone-950 p-2 text-xs outline-none focus:border-emerald-600"
          />
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            Save game
          </button>
        </div>
      )}

      {/* Game list */}
      {games.length === 0 && !adding && (
        <p className="text-xs text-stone-600">
          No games logged yet — log them here or from a finished playtest.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {games.map((game) => (
          <div
            key={String(game.id)}
            className="flex items-start gap-2 rounded-md bg-stone-900/60 px-3 py-2 text-xs"
          >
            <span
              className={`mt-0.5 w-5 shrink-0 text-center font-black ${
                game.result === "W"
                  ? "text-emerald-400"
                  : game.result === "L"
                    ? "text-rose-400"
                    : "text-stone-400"
              }`}
            >
              {game.result}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-stone-300">
                {new Date(game.date).toLocaleDateString()} · {game.podSize}-pod
                {game.turns ? ` · ${game.turns} turns` : ""}
                {game.mulligans ? ` · ${game.mulligans} mull${game.mulligans === 1 ? "" : "s"}` : ""}
                {game.isPlaytest && (
                  <span className="ml-1 rounded bg-sky-900/60 px-1 py-0.5 text-[9px] font-bold text-sky-300">
                    PLAYTEST
                  </span>
                )}
              </div>
              {game.opponents.length > 0 && (
                <div className="text-[11px] text-stone-500">vs {game.opponents.join(", ")}</div>
              )}
              {game.notablePlays && (
                <div className="mt-0.5 text-[11px] text-stone-400 italic">“{game.notablePlays}”</div>
              )}
            </div>
            <button
              onClick={async () => {
                if (game.id !== undefined) {
                  await getRepo().deleteGame(deckId, game.id);
                  await refresh();
                }
              }}
              className="shrink-0 text-stone-600 hover:text-rose-400"
              title="Delete game"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

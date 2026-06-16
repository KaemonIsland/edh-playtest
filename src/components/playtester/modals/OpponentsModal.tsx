"use client";

import { useState } from "react";
import { MAX_OPPONENTS, isBotId, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { buildDeckFromText } from "@/lib/deck/build";
import { fetchAverageDeck } from "@/lib/bot/edhrec";
import { FALLBACK_DECKS } from "@/lib/bot/fallbackDecks";
import { Modal } from "./Modal";

/** Add/remove bot opponents during a game (also used after "Playtest this deck"). */
export function OpponentsModal() {
  const g = useGameStore();
  const closeModal = useUiStore((s) => s.closeModal);
  const setViewedOpponent = useUiStore((s) => s.setViewedOpponent);

  const [mode, setMode] = useState<"edhrec" | "paste">("edhrec");
  const [commander, setCommander] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const botIds = g.playerOrder.filter(isBotId);
  const full = botIds.length >= MAX_OPPONENTS;

  const addFromText = async (deckText: string, name: string) => {
    setBusy(true);
    setStatus("Resolving deck via Scryfall…");
    try {
      const built = await buildDeckFromText(deckText, name);
      const id = g.addOpponent(built.deck);
      if (id) {
        setViewedOpponent(id);
        setStatus(`✓ Added ${built.deck.name}.`);
        setText("");
        setCommander("");
      } else {
        setStatus("Couldn't add — opponent limit reached.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to add opponent.");
    } finally {
      setBusy(false);
    }
  };

  const addEdhrec = async () => {
    if (!commander.trim()) return;
    setBusy(true);
    setStatus("Fetching average deck from EDHREC…");
    try {
      const result = await fetchAverageDeck(commander.trim());
      if (result) {
        await addFromText(
          `1 ${result.commanderName} *CMDR*\n${result.lines.join("\n")}`,
          `${result.commanderName} (EDHREC avg)`,
        );
      } else {
        setStatus("EDHREC fetch failed — try a bundled deck or paste a list.");
        setBusy(false);
      }
    } catch {
      setStatus("EDHREC fetch failed — try a bundled deck or paste a list.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Manage opponents" wide>
      {/* Current opponents */}
      <div className="mb-4">
        <div className="mb-1.5 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          Current opponents ({botIds.length}/{MAX_OPPONENTS})
        </div>
        {botIds.length === 0 ? (
          <p className="text-xs text-stone-600">No opponents — solo goldfishing.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {botIds.map((id) => (
              <div
                key={id}
                className="flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2"
              >
                <span className="text-sm">🤖</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-200">
                  {g.players[id]?.name ?? id}
                </span>
                {g.activePlayerId === id && (
                  <span className="rounded-full bg-rose-900/70 px-2 py-0.5 text-[9px] font-bold text-rose-200 uppercase">
                    their turn
                  </span>
                )}
                <button
                  onClick={() => g.removeOpponent(id)}
                  className="rounded bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:bg-stone-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add an opponent */}
      {full ? (
        <p className="text-xs text-stone-500">Opponent limit reached ({MAX_OPPONENTS}).</p>
      ) : (
        <div className="rounded-lg border border-stone-800 bg-stone-900/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-stone-200">Add an opponent</span>
            <div className="flex gap-0.5 rounded-lg bg-stone-900 p-0.5">
              {(["edhrec", "paste"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    mode === m ? "bg-stone-700 text-white" : "text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {m === "edhrec" ? "EDHREC average" : "Paste decklist"}
                </button>
              ))}
            </div>
          </div>

          {mode === "edhrec" ? (
            <div className="mb-2 flex gap-2">
              <input
                value={commander}
                onChange={(e) => setCommander(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addEdhrec()}
                placeholder="Commander name, e.g. Atraxa, Praetors' Voice"
                className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
              />
              <button
                onClick={() => void addEdhrec()}
                disabled={busy || !commander.trim()}
                className="shrink-0 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {busy ? "Adding…" : "Add"}
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the opponent's decklist…"
                rows={5}
                className="mb-2 w-full rounded-md border border-stone-700 bg-stone-900 p-2 font-mono text-xs outline-none focus:border-emerald-600"
              />
              <button
                onClick={() => void addFromText(text, "Opponent deck")}
                disabled={busy || !text.trim()}
                className="mb-2 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {busy ? "Adding…" : "Add opponent"}
              </button>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-stone-500">Bundled (offline):</span>
            {FALLBACK_DECKS.map((fb) => (
              <button
                key={fb.name}
                onClick={() => void addFromText(fb.list, fb.name)}
                disabled={busy}
                className="rounded-md bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700 disabled:opacity-40"
              >
                {fb.commander}
              </button>
            ))}
          </div>
          {status && <p className="mt-2 text-[11px] text-stone-400">{status}</p>}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={closeModal}
          className="rounded-md bg-stone-800 px-4 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

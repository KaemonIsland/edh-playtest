"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameSnapshot } from "@/types";
import { useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { deleteSnapshot, listSnapshots, saveSnapshot } from "@/lib/game/snapshots";
import { Modal } from "./Modal";

export function SnapshotsPanel() {
  const g = useGameStore();
  const closeModal = useUiStore((s) => s.closeModal);
  const [snapshots, setSnapshots] = useState<GameSnapshot[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshots(await listSnapshots());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setBusy(true);
    try {
      await saveSnapshot(
        name.trim() || `Turn ${g.turn} — ${new Date().toLocaleString()}`,
        g.deck?.name ?? "Unknown deck",
        {
          players: g.players,
          playerOrder: g.playerOrder,
          turn: g.turn,
          phase: g.phase,
          activePlayerId: g.activePlayerId,
          instances: g.instances,
          zoneOrder: g.zoneOrder,
          log: g.log,
        },
        g.cards,
      );
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Game snapshots">
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Snapshot name (default: Turn ${g.turn})`}
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
        />
        <button
          onClick={() => void save()}
          disabled={busy || !g.started}
          className="shrink-0 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          Save current
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {snapshots.length === 0 && (
          <div className="py-4 text-center text-xs text-stone-600">No snapshots saved yet.</div>
        )}
        {snapshots.map((snap) => (
          <div
            key={snap.id}
            className="flex items-center justify-between gap-2 rounded-md bg-stone-900 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-stone-200">{snap.name}</div>
              <div className="text-[10px] text-stone-500">
                {snap.deckName} · turn {snap.core.turn} · {new Date(snap.savedAt).toLocaleString()}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => {
                  g.restoreCore(snap.core, snap.cards);
                  closeModal();
                }}
                className="rounded bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-stone-700"
              >
                Load
              </button>
              <button
                onClick={async () => {
                  if (snap.id !== undefined) await deleteSnapshot(snap.id);
                  await refresh();
                }}
                className="rounded bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:bg-stone-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

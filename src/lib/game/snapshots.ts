"use client";

import type { GameCore, GameSnapshot, ScryCard } from "@/types";
import { db } from "@/lib/db";

export async function saveSnapshot(
  name: string,
  deckName: string,
  core: GameCore,
  cards: Record<string, ScryCard>,
): Promise<number> {
  // Only persist cards the snapshot actually references.
  const referenced = new Set(
    Object.values(core.instances)
      .map((i) => i.cardId)
      .filter(Boolean),
  );
  const snapshot: GameSnapshot = {
    name,
    savedAt: Date.now(),
    deckName,
    core: structuredClone(core),
    cards: [...referenced].map((id) => cards[id]).filter((c): c is ScryCard => !!c),
  };
  return (await db.snapshots.add(snapshot)) as number;
}

export async function listSnapshots(): Promise<GameSnapshot[]> {
  return db.snapshots.orderBy("savedAt").reverse().toArray();
}

export async function deleteSnapshot(id: number): Promise<void> {
  await db.snapshots.delete(id);
}

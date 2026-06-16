"use client";

import type { ScryCard } from "@/types";
import {
  collectionEntryId,
  finishPrice,
  getRepo,
  type CardFinish,
  type CollectionCard,
} from "@/lib/repo";

/** Adjust the owned quantity of a printing+finish by `delta`. Returns new qty. */
export async function adjustCollection(
  card: ScryCard,
  finish: CardFinish,
  delta: number,
): Promise<number> {
  const repo = getRepo();
  const id = collectionEntryId(card.id, finish);
  const existing = await repo.getCollectionEntry(id); // indexed single read
  const nextQty = Math.max(0, (existing?.quantity ?? 0) + delta);
  const now = Date.now();
  await repo.saveCollectionEntry({
    id,
    printingId: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    finish,
    quantity: nextQty,
    card,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  });
  return nextQty;
}

/** Set the exact owned quantity of a printing+finish. */
export async function setCollectionQty(
  card: ScryCard,
  finish: CardFinish,
  quantity: number,
): Promise<void> {
  const repo = getRepo();
  const id = collectionEntryId(card.id, finish);
  const existing = await repo.getCollectionEntry(id); // indexed single read
  const now = Date.now();
  await repo.saveCollectionEntry({
    id,
    printingId: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    finish,
    quantity: Math.max(0, quantity),
    card,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  });
}

export interface CollectionStats {
  totalCards: number;
  uniquePrintings: number;
  uniqueOracle: number;
  value: number;
}

export function collectionStats(cards: CollectionCard[]): CollectionStats {
  let totalCards = 0;
  let value = 0;
  const oracleIds = new Set<string>();
  for (const c of cards) {
    totalCards += c.quantity;
    oracleIds.add(c.oracleId);
    const unit = finishPrice(c.card, c.finish);
    if (unit !== null) value += unit * c.quantity;
  }
  return {
    totalCards,
    uniquePrintings: cards.length,
    uniqueOracle: oracleIds.size,
    value,
  };
}

/** Set of oracle ids the user owns (for the builder's "owned only" filter). */
export async function ownedOracleIds(): Promise<Set<string>> {
  return getRepo().ownedOracleIds();
}

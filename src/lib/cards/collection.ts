"use client";

import type { ScryCard } from "@/types";
import {
  collectionEntryId,
  getRepo,
  type CardFinish,
  type CollectionCard,
} from "@/lib/repo";
import { priceOf } from "@/lib/cards/pricing";
import { db } from "@/lib/db";
import { getCardDbStatus } from "@/lib/cards/carddb";

/**
 * Backfill newer card fields (rarity, released_at, keywords) onto collection
 * rows imported before those fields existed, using the synced local card DB.
 * Returns a possibly-new array and persists enriched rows. No-op if the card
 * DB isn't synced (with those fields) or nothing is missing.
 *
 * Note: rarity is taken at the oracle level (the synced DB stores one printing
 * per card), so it's a close approximation rather than the exact printing's
 * rarity — good enough for "show me my rares/mythics".
 */
export async function enrichCollectionFromOracle(
  cards: CollectionCard[],
): Promise<CollectionCard[]> {
  if (!getCardDbStatus().syncedAt) return cards;
  const missing: number[] = [];
  cards.forEach((c, i) => {
    if (c.card.rarity === undefined) missing.push(i);
  });
  if (missing.length === 0) return cards;

  const oracleRows = await db.oracle.bulkGet(missing.map((i) => cards[i]!.oracleId));
  const out = [...cards];
  const toPersist: CollectionCard[] = [];
  oracleRows.forEach((row, k) => {
    const ref = row?.card;
    if (!ref || ref.rarity === undefined) return;
    const i = missing[k]!;
    const merged: CollectionCard = {
      ...out[i]!,
      card: {
        ...out[i]!.card,
        rarity: ref.rarity,
        released_at: out[i]!.card.released_at ?? ref.released_at,
        keywords: out[i]!.card.keywords ?? ref.keywords,
      },
    };
    out[i] = merged;
    toPersist.push(merged);
  });
  if (toPersist.length) await getRepo().saveCollectionEntries(toPersist).catch(() => {});
  return out;
}

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
    const unit = priceOf(c.card, c.finish);
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

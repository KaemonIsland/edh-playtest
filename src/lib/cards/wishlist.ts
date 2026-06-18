"use client";

import type { ScryCard } from "@/types";
import { getRepo, type WishlistCard } from "@/lib/repo";

/** Adjust a card's wishlist quantity by `delta` (oracle-level). Returns new qty. */
export async function adjustWishlist(card: ScryCard, delta: number): Promise<number> {
  const repo = getRepo();
  const existing = await repo.getWishlistEntry(card.oracle_id);
  const next = Math.max(0, (existing?.quantity ?? 0) + delta);
  const now = Date.now();
  await repo.saveWishlistEntry({
    oracleId: card.oracle_id,
    name: card.name,
    card,
    quantity: next,
    note: existing?.note,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  });
  return next;
}

export async function setWishlistQty(card: ScryCard, quantity: number): Promise<void> {
  const repo = getRepo();
  const existing = await repo.getWishlistEntry(card.oracle_id);
  const now = Date.now();
  await repo.saveWishlistEntry({
    oracleId: card.oracle_id,
    name: card.name,
    card,
    quantity: Math.max(0, quantity),
    note: existing?.note,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  });
}

/** Add several cards to the wishlist at once (e.g. a deck's missing cards). */
export async function addManyToWishlist(
  items: { card: ScryCard; quantity: number }[],
): Promise<number> {
  const repo = getRepo();
  let added = 0;
  for (const { card, quantity } of items) {
    if (quantity <= 0) continue;
    const existing = await repo.getWishlistEntry(card.oracle_id);
    const now = Date.now();
    await repo.saveWishlistEntry({
      oracleId: card.oracle_id,
      name: card.name,
      card,
      quantity: Math.max(existing?.quantity ?? 0, quantity),
      note: existing?.note,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
    });
    added += 1;
  }
  return added;
}

/** Set of oracle ids currently on the wishlist. */
export async function wishlistOracleIds(): Promise<Set<string>> {
  const all = await getRepo().listWishlist();
  return new Set(all.filter((w) => w.quantity > 0).map((w) => w.oracleId));
}

export type { WishlistCard };

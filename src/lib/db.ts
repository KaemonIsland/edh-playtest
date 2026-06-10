import Dexie, { type EntityTable } from "dexie";
import type { GameSnapshot, ScryCard } from "@/types";

/** A cached Scryfall card. `key` is the normalized name used for lookups. */
export interface CachedCard {
  key: string;
  card: ScryCard;
  fetchedAt: number;
}

export const CARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h minimum freshness

export function normalizeCardName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // match on front-face name for DFCs written as "A // B"
    .split("//")[0]!
    .trim();
}

const db = new Dexie("edh-playtest") as Dexie & {
  cards: EntityTable<CachedCard, "key">;
  snapshots: EntityTable<GameSnapshot, "id">;
};

db.version(1).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
});

export { db };

export async function getCachedCards(
  names: string[],
): Promise<{ found: Map<string, ScryCard>; missing: string[] }> {
  const keys = names.map(normalizeCardName);
  const rows = await db.cards.bulkGet(keys);
  const found = new Map<string, ScryCard>();
  const missing: string[] = [];
  rows.forEach((row, i) => {
    const name = names[i]!;
    if (row && Date.now() - row.fetchedAt < CARD_CACHE_TTL_MS) {
      found.set(name, row.card);
    } else {
      missing.push(name);
    }
  });
  return { found, missing };
}

export async function cacheCards(cards: ScryCard[]): Promise<void> {
  const now = Date.now();
  await db.cards.bulkPut(
    cards.map((card) => ({ key: normalizeCardName(card.name), card, fetchedAt: now })),
  );
}

export async function getCardsById(ids: string[]): Promise<Map<string, ScryCard>> {
  const rows = await db.cards.where("card.id").anyOf(ids).toArray();
  return new Map(rows.map((r) => [r.card.id, r.card]));
}

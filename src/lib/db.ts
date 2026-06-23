import Dexie, { type EntityTable } from "dexie";
import type { GameSnapshot, ScryCard } from "@/types";
import type {
  CollectionCard,
  DeckVersion,
  GameRecord,
  Primer,
  ShowcaseDeck,
  UnresolvedImport,
  WishlistCard,
} from "@/lib/repo/types";

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

/** Cached EDHREC average-deck list (best-effort community data). */
export interface CachedEdhrecDeck {
  slug: string;
  commanderName: string;
  lines: string[];
  fetchedAt: number;
}

export const EDHREC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** One row of the synced local card database (oracle-level, slim). */
export interface OracleCard {
  oracle_id: string;
  /** Lowercased name for prefix search. */
  nameKey: string;
  card: ScryCard;
}

/**
 * MTGJSON prices for one printing, keyed by Scryfall id. Stored per provider +
 * finish so the UI's TCGplayer/Card Kingdom toggle is just a field pick. Values
 * are USD; missing providers/finishes are simply absent.
 */
export interface CardPriceRow {
  /** Scryfall printing id. */
  id: string;
  tcg?: number;
  tcgFoil?: number;
  ck?: number;
  ckFoil?: number;
}

const db = new Dexie("edh-playtest") as Dexie & {
  cards: EntityTable<CachedCard, "key">;
  snapshots: EntityTable<GameSnapshot, "id">;
  edhrecDecks: EntityTable<CachedEdhrecDeck, "slug">;
  showcaseDecks: EntityTable<ShowcaseDeck, "id">;
  primers: EntityTable<Primer, "deckId">;
  deckVersions: EntityTable<DeckVersion & { id?: number }, "id">;
  games: EntityTable<GameRecord & { id?: number }, "id">;
  oracle: EntityTable<OracleCard, "oracle_id">;
  collection: EntityTable<CollectionCard, "id">;
  wishlist: EntityTable<WishlistCard, "oracleId">;
  unresolvedImports: EntityTable<UnresolvedImport, "id">;
  prices: EntityTable<CardPriceRow, "id">;
};

db.version(1).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
});

db.version(2).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
});

db.version(3).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
  showcaseDecks: "id, name, updatedAt",
  primers: "deckId",
  deckVersions: "++id, deckId, date",
  games: "++id, deckId, date",
});

db.version(4).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
  showcaseDecks: "id, name, updatedAt",
  primers: "deckId",
  deckVersions: "++id, deckId, date",
  games: "++id, deckId, date",
  oracle: "oracle_id, nameKey",
});

db.version(5).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
  showcaseDecks: "id, name, updatedAt",
  primers: "deckId",
  deckVersions: "++id, deckId, date",
  games: "++id, deckId, date",
  oracle: "oracle_id, nameKey",
  collection: "id, oracleId, updatedAt",
});

db.version(6).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
  showcaseDecks: "id, name, updatedAt",
  primers: "deckId",
  deckVersions: "++id, deckId, date",
  games: "++id, deckId, date",
  oracle: "oracle_id, nameKey",
  collection: "id, oracleId, updatedAt",
  wishlist: "oracleId, updatedAt",
});

db.version(7).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
  showcaseDecks: "id, name, updatedAt",
  primers: "deckId",
  deckVersions: "++id, deckId, date",
  games: "++id, deckId, date",
  oracle: "oracle_id, nameKey",
  collection: "id, oracleId, updatedAt",
  wishlist: "oracleId, updatedAt",
  unresolvedImports: "id, createdAt",
});

db.version(8).stores({
  cards: "key, card.id, fetchedAt",
  snapshots: "++id, savedAt, deckName",
  edhrecDecks: "slug, fetchedAt",
  showcaseDecks: "id, name, updatedAt",
  primers: "deckId",
  deckVersions: "++id, deckId, date",
  games: "++id, deckId, date",
  oracle: "oracle_id, nameKey",
  collection: "id, oracleId, updatedAt",
  wishlist: "oracleId, updatedAt",
  unresolvedImports: "id, createdAt",
  prices: "id",
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
  const rows = cards.map((card) => ({ key: normalizeCardName(card.name), card, fetchedAt: now }));
  // Chunk so a large import (25k printings) isn't one huge transaction.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.cards.bulkPut(rows.slice(i, i + CHUNK));
  }
}

export async function getCardsById(ids: string[]): Promise<Map<string, ScryCard>> {
  const rows = await db.cards.where("card.id").anyOf(ids).toArray();
  return new Map(rows.map((r) => [r.card.id, r.card]));
}

"use client";

import { getLegacyLocalRepo, getRepo } from "./index";

const DONE_KEY = "edh-playtest:migrated-to-server";

export interface MigrationStatus {
  decks: number;
  collection: number;
  wishlist: number;
}

/** Has legacy browser (IndexedDB) data that hasn't been migrated yet? */
export async function pendingLegacyData(): Promise<MigrationStatus | null> {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(DONE_KEY)) return null;
  } catch {
    return null;
  }
  // Don't offer migration when already on the browser repo somehow.
  if (getRepo().mode === "local") return null;
  try {
    const legacy = getLegacyLocalRepo();
    const [decks, collection, wishlist] = await Promise.all([
      legacy.listDecks(),
      legacy.listCollection(),
      legacy.listWishlist(),
    ]);
    if (decks.length === 0 && collection.length === 0 && wishlist.length === 0) {
      markMigrated();
      return null;
    }
    return { decks: decks.length, collection: collection.length, wishlist: wishlist.length };
  } catch {
    return null;
  }
}

export function markMigrated(): void {
  try {
    window.localStorage.setItem(DONE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export interface MigrationProgress {
  phase: "decks" | "collection" | "wishlist" | "done";
  done: number;
  total: number;
}

/** Copy all legacy browser data into the active (Postgres/Supabase) repo. */
export async function migrateLegacyData(onProgress?: (p: MigrationProgress) => void): Promise<void> {
  const legacy = getLegacyLocalRepo();
  const repo = getRepo();

  // Decks (+ their primer, versions, games).
  const deckMetas = await legacy.listDecks();
  let i = 0;
  for (const meta of deckMetas) {
    const full = await legacy.getDeck(meta.id);
    if (full) {
      await repo.saveDeck(full.deck, full.description);
      const primer = await legacy.getPrimer(meta.id);
      if (primer) await repo.savePrimer(primer);
      for (const v of await legacy.listVersions(meta.id)) await repo.addVersion(v);
      for (const g of await legacy.listGames(meta.id)) await repo.addGame(g);
    }
    onProgress?.({ phase: "decks", done: ++i, total: deckMetas.length });
  }

  // Collection (bulk).
  const collection = await legacy.listCollection();
  if (collection.length > 0) {
    onProgress?.({ phase: "collection", done: 0, total: collection.length });
    await repo.saveCollectionEntries(collection);
    onProgress?.({ phase: "collection", done: collection.length, total: collection.length });
  }

  // Wishlist.
  const wishlist = await legacy.listWishlist();
  let w = 0;
  for (const entry of wishlist) {
    await repo.saveWishlistEntry(entry);
    onProgress?.({ phase: "wishlist", done: ++w, total: wishlist.length });
  }

  markMigrated();
  onProgress?.({ phase: "done", done: 1, total: 1 });
}

"use client";

import type { Deck } from "@/types";
import type {
  CollectionCard,
  DeckComment,
  DeckVersion,
  GameRecord,
  Primer,
  Repo,
  ShowcaseDeck,
  ShowcaseDeckMeta,
  WishlistCard,
} from "./types";

/** Client-side Repo that talks to local Postgres through the /api/db RPC route.
 * This is the default local backend. */
export class ServerRepo implements Repo {
  readonly mode = "postgres" as const;

  private async call<T>(op: string, args: unknown[] = []): Promise<T> {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, args }),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok) throw new Error(data.error || `Database request failed (${res.status})`);
    return data.result as T;
  }

  listDecks(): Promise<ShowcaseDeckMeta[]> {
    return this.call("listDecks");
  }
  getDeck(id: string): Promise<ShowcaseDeck | null> {
    return this.call("getDeck", [id]);
  }
  saveDeck(deck: Deck, description?: string): Promise<string> {
    return this.call("saveDeck", [deck, description]);
  }
  deleteDeck(id: string): Promise<void> {
    return this.call("deleteDeck", [id]);
  }

  getPrimer(deckId: string): Promise<Primer | null> {
    return this.call("getPrimer", [deckId]);
  }
  savePrimer(primer: Primer): Promise<void> {
    return this.call("savePrimer", [primer]);
  }

  listVersions(deckId: string): Promise<DeckVersion[]> {
    return this.call("listVersions", [deckId]);
  }
  addVersion(version: DeckVersion): Promise<void> {
    return this.call("addVersion", [version]);
  }
  deleteVersion(deckId: string, id: number | string): Promise<void> {
    return this.call("deleteVersion", [deckId, id]);
  }

  listGames(deckId: string): Promise<GameRecord[]> {
    return this.call("listGames", [deckId]);
  }
  addGame(game: GameRecord): Promise<void> {
    return this.call("addGame", [game]);
  }
  deleteGame(deckId: string, id: number | string): Promise<void> {
    return this.call("deleteGame", [deckId, id]);
  }

  listComments(deckId: string): Promise<DeckComment[]> {
    return this.call("listComments", [deckId]);
  }
  addComment(comment: DeckComment): Promise<void> {
    return this.call("addComment", [comment]);
  }
  deleteComment(deckId: string, id: number | string): Promise<void> {
    return this.call("deleteComment", [deckId, id]);
  }

  listCollection(): Promise<CollectionCard[]> {
    return this.call("listCollection");
  }
  getCollectionEntry(id: string): Promise<CollectionCard | null> {
    return this.call("getCollectionEntry", [id]);
  }
  getCollectionByOracle(oracleId: string): Promise<CollectionCard[]> {
    return this.call("getCollectionByOracle", [oracleId]);
  }
  async ownedOracleIds(): Promise<Set<string>> {
    return new Set(await this.call<string[]>("ownedOracleIds"));
  }
  saveCollectionEntry(entry: CollectionCard): Promise<void> {
    return this.call("saveCollectionEntry", [entry]);
  }
  saveCollectionEntries(entries: CollectionCard[]): Promise<void> {
    return this.call("saveCollectionEntries", [entries]);
  }
  removeCollectionEntry(id: string): Promise<void> {
    return this.call("removeCollectionEntry", [id]);
  }
  clearCollection(): Promise<void> {
    return this.call("clearCollection");
  }

  listWishlist(): Promise<WishlistCard[]> {
    return this.call("listWishlist");
  }
  getWishlistEntry(oracleId: string): Promise<WishlistCard | null> {
    return this.call("getWishlistEntry", [oracleId]);
  }
  saveWishlistEntry(entry: WishlistCard): Promise<void> {
    return this.call("saveWishlistEntry", [entry]);
  }
  removeWishlistEntry(oracleId: string): Promise<void> {
    return this.call("removeWishlistEntry", [oracleId]);
  }
}

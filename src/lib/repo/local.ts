"use client";

import type { Deck } from "@/types";
import { db } from "@/lib/db";
import type {
  DeckComment,
  DeckVersion,
  GameRecord,
  Primer,
  Repo,
  ShowcaseDeck,
  ShowcaseDeckMeta,
} from "./types";

function metaOf(deck: Deck): Omit<ShowcaseDeckMeta, "updatedAt"> {
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    commanderNames: deck.commanders.map((c) => c.name),
    commanderArt:
      deck.commanders[0]?.image_uris?.art_crop ??
      deck.commanders[0]?.card_faces?.[0]?.image_uris?.art_crop,
    colorIdentity: deck.colorIdentity,
  };
}

/** Zero-setup persistence in IndexedDB. Comments are backend-only. */
export class LocalRepo implements Repo {
  readonly mode = "local" as const;

  async listDecks(): Promise<ShowcaseDeckMeta[]> {
    const decks = await db.showcaseDecks.orderBy("updatedAt").reverse().toArray();
    return decks.map(({ deck: _deck, ...meta }) => meta);
  }

  async getDeck(id: string): Promise<ShowcaseDeck | null> {
    return (await db.showcaseDecks.get(id)) ?? null;
  }

  async saveDeck(deck: Deck, description?: string): Promise<string> {
    const existing = await db.showcaseDecks.get(deck.id);
    await db.showcaseDecks.put({
      ...metaOf(deck),
      deck,
      description: description ?? existing?.description,
      updatedAt: Date.now(),
    });
    return deck.id;
  }

  async deleteDeck(id: string): Promise<void> {
    await Promise.all([
      db.showcaseDecks.delete(id),
      db.primers.delete(id),
      db.deckVersions.where("deckId").equals(id).delete(),
      db.games.where("deckId").equals(id).delete(),
    ]);
  }

  async getPrimer(deckId: string): Promise<Primer | null> {
    return (await db.primers.get(deckId)) ?? null;
  }

  async savePrimer(primer: Primer): Promise<void> {
    await db.primers.put({ ...primer, updatedAt: Date.now() });
  }

  async listVersions(deckId: string): Promise<DeckVersion[]> {
    const rows = await db.deckVersions.where("deckId").equals(deckId).toArray();
    return rows.sort((a, b) => b.date - a.date);
  }

  async addVersion(version: DeckVersion): Promise<void> {
    const { id: _id, ...rest } = version;
    await db.deckVersions.add(rest as DeckVersion & { id?: number });
  }

  async deleteVersion(_deckId: string, id: number | string): Promise<void> {
    await db.deckVersions.delete(Number(id));
  }

  async listGames(deckId: string): Promise<GameRecord[]> {
    const rows = await db.games.where("deckId").equals(deckId).toArray();
    return rows.sort((a, b) => b.date - a.date);
  }

  async addGame(game: GameRecord): Promise<void> {
    const { id: _id, ...rest } = game;
    await db.games.add(rest as GameRecord & { id?: number });
  }

  async deleteGame(_deckId: string, id: number | string): Promise<void> {
    await db.games.delete(Number(id));
  }

  async listComments(): Promise<DeckComment[]> {
    return []; // comments need the shared backend
  }

  async addComment(): Promise<void> {
    throw new Error("Comments require the Supabase backend (see supabase/schema.sql).");
  }

  async deleteComment(): Promise<void> {
    throw new Error("Comments require the Supabase backend (see supabase/schema.sql).");
  }
}

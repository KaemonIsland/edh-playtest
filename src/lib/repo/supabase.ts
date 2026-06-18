"use client";

import type { Deck } from "@/types";
import type {
  CardFinish,
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

/**
 * Supabase implementation via plain PostgREST fetch (no SDK dependency).
 * Activated when NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are
 * set; tables/policies in supabase/schema.sql. Uses the anon role — fine for
 * a personal instance; tighten RLS before opening it up.
 */
export class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;

  constructor(
    private url: string,
    private anonKey: string,
  ) {}

  private async rest<T>(
    path: string,
    init: RequestInit & { expectRows?: boolean } = {},
  ): Promise<T> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
        "Content-Type": "application/json",
        Prefer: init.method === "POST" || init.method === "PATCH" ? "return=representation,resolution=merge-duplicates" : "",
        ...init.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase ${init.method ?? "GET"} ${path} failed (${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listDecks(): Promise<ShowcaseDeckMeta[]> {
    type Row = {
      id: string;
      name: string;
      format: string;
      commander_names: string[];
      commander_art: string | null;
      color_identity: string[];
      updated_at: string;
    };
    const rows = await this.rest<Row[]>(
      "decks?select=id,name,format,commander_names,commander_art,color_identity,updated_at&order=updated_at.desc",
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      format: r.format,
      commanderNames: r.commander_names ?? [],
      commanderArt: r.commander_art ?? undefined,
      colorIdentity: r.color_identity ?? [],
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  }

  async getDeck(id: string): Promise<ShowcaseDeck | null> {
    type Row = {
      id: string;
      name: string;
      format: string;
      commander_names: string[];
      commander_art: string | null;
      color_identity: string[];
      description: string | null;
      deck_json: Deck;
      updated_at: string;
    };
    const rows = await this.rest<Row[]>(`decks?id=eq.${encodeURIComponent(id)}&select=*`);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      format: r.format,
      commanderNames: r.commander_names ?? [],
      commanderArt: r.commander_art ?? undefined,
      colorIdentity: r.color_identity ?? [],
      description: r.description ?? undefined,
      deck: r.deck_json,
      updatedAt: new Date(r.updated_at).getTime(),
    };
  }

  async saveDeck(deck: Deck, description?: string): Promise<string> {
    await this.rest("decks?on_conflict=id", {
      method: "POST",
      body: JSON.stringify([
        {
          id: deck.id,
          name: deck.name,
          format: deck.format,
          commander_names: deck.commanders.map((c) => c.name),
          commander_art:
            deck.commanders[0]?.image_uris?.art_crop ??
            deck.commanders[0]?.card_faces?.[0]?.image_uris?.art_crop ??
            null,
          color_identity: deck.colorIdentity,
          description: description ?? null,
          deck_json: deck,
          updated_at: new Date().toISOString(),
        },
      ]),
    });
    return deck.id;
  }

  async deleteDeck(id: string): Promise<void> {
    await this.rest(`decks?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async getPrimer(deckId: string): Promise<Primer | null> {
    type Row = {
      deck_id: string;
      strategy: string;
      combos: string;
      mulligans: string;
      matchups: string;
      budget: string;
      updated_at: string;
    };
    const rows = await this.rest<Row[]>(`primers?deck_id=eq.${encodeURIComponent(deckId)}`);
    const r = rows[0];
    if (!r) return null;
    return {
      deckId: r.deck_id,
      strategy: r.strategy ?? "",
      combos: r.combos ?? "",
      mulligans: r.mulligans ?? "",
      matchups: r.matchups ?? "",
      budget: r.budget ?? "",
      updatedAt: new Date(r.updated_at).getTime(),
    };
  }

  async savePrimer(primer: Primer): Promise<void> {
    await this.rest("primers?on_conflict=deck_id", {
      method: "POST",
      body: JSON.stringify([
        {
          deck_id: primer.deckId,
          strategy: primer.strategy,
          combos: primer.combos,
          mulligans: primer.mulligans,
          matchups: primer.matchups,
          budget: primer.budget,
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  }

  async listVersions(deckId: string): Promise<DeckVersion[]> {
    type Row = {
      id: string;
      deck_id: string;
      date: string;
      title: string;
      adds: DeckVersion["adds"];
      cuts: DeckVersion["cuts"];
      notes: string | null;
    };
    const rows = await this.rest<Row[]>(
      `deck_versions?deck_id=eq.${encodeURIComponent(deckId)}&order=date.desc`,
    );
    return rows.map((r) => ({
      id: r.id,
      deckId: r.deck_id,
      date: new Date(r.date).getTime(),
      title: r.title,
      adds: r.adds ?? [],
      cuts: r.cuts ?? [],
      notes: r.notes ?? undefined,
    }));
  }

  async addVersion(version: DeckVersion): Promise<void> {
    await this.rest("deck_versions", {
      method: "POST",
      body: JSON.stringify([
        {
          deck_id: version.deckId,
          date: new Date(version.date).toISOString(),
          title: version.title,
          adds: version.adds,
          cuts: version.cuts,
          notes: version.notes ?? null,
        },
      ]),
    });
  }

  async deleteVersion(_deckId: string, id: number | string): Promise<void> {
    await this.rest(`deck_versions?id=eq.${encodeURIComponent(String(id))}`, { method: "DELETE" });
  }

  async listGames(deckId: string): Promise<GameRecord[]> {
    type Row = {
      id: string;
      deck_id: string;
      date: string;
      pod_size: number;
      opponents: string[];
      result: GameRecord["result"];
      turns: number | null;
      mulligans: number | null;
      notable_plays: string | null;
      is_playtest: boolean;
    };
    const rows = await this.rest<Row[]>(
      `games?deck_id=eq.${encodeURIComponent(deckId)}&order=date.desc`,
    );
    return rows.map((r) => ({
      id: r.id,
      deckId: r.deck_id,
      date: new Date(r.date).getTime(),
      podSize: r.pod_size,
      opponents: r.opponents ?? [],
      result: r.result,
      turns: r.turns ?? undefined,
      mulligans: r.mulligans ?? undefined,
      notablePlays: r.notable_plays ?? undefined,
      isPlaytest: r.is_playtest,
    }));
  }

  async addGame(game: GameRecord): Promise<void> {
    await this.rest("games", {
      method: "POST",
      body: JSON.stringify([
        {
          deck_id: game.deckId,
          date: new Date(game.date).toISOString(),
          pod_size: game.podSize,
          opponents: game.opponents,
          result: game.result,
          turns: game.turns ?? null,
          mulligans: game.mulligans ?? null,
          notable_plays: game.notablePlays ?? null,
          is_playtest: game.isPlaytest,
        },
      ]),
    });
  }

  async deleteGame(_deckId: string, id: number | string): Promise<void> {
    await this.rest(`games?id=eq.${encodeURIComponent(String(id))}`, { method: "DELETE" });
  }

  async listComments(deckId: string): Promise<DeckComment[]> {
    type Row = {
      id: string;
      deck_id: string;
      author: string;
      body: string;
      date: string;
      parent_id: string | null;
    };
    const rows = await this.rest<Row[]>(
      `comments?deck_id=eq.${encodeURIComponent(deckId)}&order=date.asc`,
    );
    return rows.map((r) => ({
      id: r.id,
      deckId: r.deck_id,
      author: r.author,
      body: r.body,
      date: new Date(r.date).getTime(),
      parentId: r.parent_id,
    }));
  }

  async addComment(comment: DeckComment): Promise<void> {
    await this.rest("comments", {
      method: "POST",
      body: JSON.stringify([
        {
          deck_id: comment.deckId,
          author: comment.author,
          body: comment.body,
          date: new Date(comment.date).toISOString(),
          parent_id: comment.parentId ?? null,
        },
      ]),
    });
  }

  async deleteComment(_deckId: string, id: number | string): Promise<void> {
    await this.rest(`comments?id=eq.${encodeURIComponent(String(id))}`, { method: "DELETE" });
  }

  async listCollection(): Promise<CollectionCard[]> {
    type Row = {
      id: string;
      printing_id: string;
      oracle_id: string;
      name: string;
      set_code: string | null;
      set_name: string | null;
      collector_number: string | null;
      finish: CardFinish;
      quantity: number;
      card_json: CollectionCard["card"];
      added_at: string;
      updated_at: string;
    };
    const rows = await this.rest<Row[]>("collection?select=*&order=updated_at.desc");
    return rows.map((r) => ({
      id: r.id,
      printingId: r.printing_id,
      oracleId: r.oracle_id,
      name: r.name,
      setCode: r.set_code ?? undefined,
      setName: r.set_name ?? undefined,
      collectorNumber: r.collector_number ?? undefined,
      finish: r.finish,
      quantity: r.quantity,
      card: r.card_json,
      addedAt: new Date(r.added_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  }

  private mapCollectionRow = (r: {
    id: string;
    printing_id: string;
    oracle_id: string;
    name: string;
    set_code: string | null;
    set_name: string | null;
    collector_number: string | null;
    finish: CardFinish;
    quantity: number;
    card_json: CollectionCard["card"];
    added_at?: string;
    updated_at: string;
  }): CollectionCard => ({
    id: r.id,
    printingId: r.printing_id,
    oracleId: r.oracle_id,
    name: r.name,
    setCode: r.set_code ?? undefined,
    setName: r.set_name ?? undefined,
    collectorNumber: r.collector_number ?? undefined,
    finish: r.finish,
    quantity: r.quantity,
    card: r.card_json,
    addedAt: r.added_at ? new Date(r.added_at).getTime() : Date.now(),
    updatedAt: new Date(r.updated_at).getTime(),
  });

  async getCollectionEntry(id: string): Promise<CollectionCard | null> {
    const rows = await this.rest<Parameters<typeof this.mapCollectionRow>[0][]>(
      `collection?id=eq.${encodeURIComponent(id)}&select=*`,
    );
    return rows[0] ? this.mapCollectionRow(rows[0]) : null;
  }

  async getCollectionByOracle(oracleId: string): Promise<CollectionCard[]> {
    const rows = await this.rest<Parameters<typeof this.mapCollectionRow>[0][]>(
      `collection?oracle_id=eq.${encodeURIComponent(oracleId)}&select=*`,
    );
    return rows.map(this.mapCollectionRow);
  }

  async ownedOracleIds(): Promise<Set<string>> {
    const rows = await this.rest<{ oracle_id: string }[]>("collection?select=oracle_id");
    return new Set(rows.map((r) => r.oracle_id));
  }

  async saveCollectionEntry(entry: CollectionCard): Promise<void> {
    if (entry.quantity <= 0) {
      await this.removeCollectionEntry(entry.id);
      return;
    }
    await this.rest("collection?on_conflict=id", {
      method: "POST",
      body: JSON.stringify([
        {
          id: entry.id,
          printing_id: entry.printingId,
          oracle_id: entry.oracleId,
          name: entry.name,
          set_code: entry.setCode ?? null,
          set_name: entry.setName ?? null,
          collector_number: entry.collectorNumber ?? null,
          finish: entry.finish,
          quantity: entry.quantity,
          card_json: entry.card,
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  }

  async saveCollectionEntries(entries: CollectionCard[]): Promise<void> {
    const valid = entries.filter((e) => e.quantity > 0);
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const rows = valid.slice(i, i + CHUNK).map((entry) => ({
        id: entry.id,
        printing_id: entry.printingId,
        oracle_id: entry.oracleId,
        name: entry.name,
        set_code: entry.setCode ?? null,
        set_name: entry.setName ?? null,
        collector_number: entry.collectorNumber ?? null,
        finish: entry.finish,
        quantity: entry.quantity,
        card_json: entry.card,
        updated_at: new Date().toISOString(),
      }));
      await this.rest("collection?on_conflict=id", {
        method: "POST",
        body: JSON.stringify(rows),
      });
    }
  }

  async removeCollectionEntry(id: string): Promise<void> {
    await this.rest(`collection?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async clearCollection(): Promise<void> {
    // PostgREST requires a filter on DELETE; this matches all rows.
    await this.rest("collection?id=neq.__none__", { method: "DELETE" });
  }

  async listWishlist(): Promise<WishlistCard[]> {
    type Row = {
      oracle_id: string;
      name: string;
      card_json: WishlistCard["card"];
      quantity: number;
      note: string | null;
      added_at?: string;
      updated_at: string;
    };
    const rows = await this.rest<Row[]>("wishlist?select=*&order=updated_at.desc");
    return rows.map((r) => ({
      oracleId: r.oracle_id,
      name: r.name,
      card: r.card_json,
      quantity: r.quantity,
      note: r.note ?? undefined,
      addedAt: r.added_at ? new Date(r.added_at).getTime() : Date.now(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  }

  async getWishlistEntry(oracleId: string): Promise<WishlistCard | null> {
    const all = await this.listWishlist();
    return all.find((w) => w.oracleId === oracleId) ?? null;
  }

  async saveWishlistEntry(entry: WishlistCard): Promise<void> {
    if (entry.quantity <= 0) {
      await this.removeWishlistEntry(entry.oracleId);
      return;
    }
    await this.rest("wishlist?on_conflict=oracle_id", {
      method: "POST",
      body: JSON.stringify([
        {
          oracle_id: entry.oracleId,
          name: entry.name,
          card_json: entry.card,
          quantity: entry.quantity,
          note: entry.note ?? null,
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  }

  async removeWishlistEntry(oracleId: string): Promise<void> {
    await this.rest(`wishlist?oracle_id=eq.${encodeURIComponent(oracleId)}`, { method: "DELETE" });
  }
}

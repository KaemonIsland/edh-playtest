import "server-only";
import type { Deck } from "@/types";
import { query } from "./pg";
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

/** Server-side Postgres implementation of the data layer. Reached from the
 * browser through the /api/db RPC route, never imported into client code. */
export class PgRepo implements Repo {
  readonly mode = "postgres" as const;

  // ----- Decks ------------------------------------------------------------
  async listDecks(): Promise<ShowcaseDeckMeta[]> {
    const rows = await query<{
      id: string;
      name: string;
      format: string;
      commander_names: string[];
      commander_art: string | null;
      color_identity: string[];
      updated_at: string;
    }>(
      `select id, name, format, commander_names, commander_art, color_identity, updated_at
       from decks order by updated_at desc`,
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
    const rows = await query<{
      id: string;
      name: string;
      format: string;
      commander_names: string[];
      commander_art: string | null;
      color_identity: string[];
      description: string | null;
      deck_json: Deck;
      updated_at: string;
    }>(`select * from decks where id = $1`, [id]);
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
    const art =
      deck.commanders[0]?.image_uris?.art_crop ??
      deck.commanders[0]?.card_faces?.[0]?.image_uris?.art_crop ??
      null;
    await query(
      `insert into decks (id, name, format, commander_names, commander_art, color_identity, description, deck_json, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (id) do update set
         name = excluded.name, format = excluded.format,
         commander_names = excluded.commander_names, commander_art = excluded.commander_art,
         color_identity = excluded.color_identity,
         description = coalesce(excluded.description, decks.description),
         deck_json = excluded.deck_json, updated_at = now()`,
      [
        deck.id,
        deck.name,
        deck.format,
        deck.commanders.map((c) => c.name),
        art,
        deck.colorIdentity,
        description ?? null,
        JSON.stringify(deck),
      ],
    );
    return deck.id;
  }

  async deleteDeck(id: string): Promise<void> {
    await query(`delete from decks where id = $1`, [id]);
  }

  // ----- Primer -----------------------------------------------------------
  async getPrimer(deckId: string): Promise<Primer | null> {
    const rows = await query<{
      deck_id: string;
      strategy: string;
      combos: string;
      mulligans: string;
      matchups: string;
      budget: string;
      updated_at: string;
    }>(`select * from primers where deck_id = $1`, [deckId]);
    const r = rows[0];
    if (!r) return null;
    return {
      deckId: r.deck_id,
      strategy: r.strategy,
      combos: r.combos,
      mulligans: r.mulligans,
      matchups: r.matchups,
      budget: r.budget,
      updatedAt: new Date(r.updated_at).getTime(),
    };
  }

  async savePrimer(p: Primer): Promise<void> {
    await query(
      `insert into primers (deck_id, strategy, combos, mulligans, matchups, budget, updated_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (deck_id) do update set
         strategy = excluded.strategy, combos = excluded.combos,
         mulligans = excluded.mulligans, matchups = excluded.matchups,
         budget = excluded.budget, updated_at = now()`,
      [p.deckId, p.strategy, p.combos, p.mulligans, p.matchups, p.budget],
    );
  }

  // ----- Versions ---------------------------------------------------------
  async listVersions(deckId: string): Promise<DeckVersion[]> {
    const rows = await query<{
      id: string;
      deck_id: string;
      date: string;
      title: string;
      adds: DeckVersion["adds"];
      cuts: DeckVersion["cuts"];
      notes: string | null;
    }>(`select * from deck_versions where deck_id = $1 order by date desc`, [deckId]);
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

  async addVersion(v: DeckVersion): Promise<void> {
    await query(
      `insert into deck_versions (deck_id, date, title, adds, cuts, notes)
       values ($1,$2,$3,$4,$5,$6)`,
      [v.deckId, new Date(v.date).toISOString(), v.title, JSON.stringify(v.adds), JSON.stringify(v.cuts), v.notes ?? null],
    );
  }

  async deleteVersion(_deckId: string, id: number | string): Promise<void> {
    await query(`delete from deck_versions where id = $1`, [String(id)]);
  }

  // ----- Games ------------------------------------------------------------
  async listGames(deckId: string): Promise<GameRecord[]> {
    const rows = await query<{
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
    }>(`select * from games where deck_id = $1 order by date desc`, [deckId]);
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

  async addGame(g: GameRecord): Promise<void> {
    await query(
      `insert into games (deck_id, date, pod_size, opponents, result, turns, mulligans, notable_plays, is_playtest)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        g.deckId,
        new Date(g.date).toISOString(),
        g.podSize,
        g.opponents,
        g.result,
        g.turns ?? null,
        g.mulligans ?? null,
        g.notablePlays ?? null,
        g.isPlaytest,
      ],
    );
  }

  async deleteGame(_deckId: string, id: number | string): Promise<void> {
    await query(`delete from games where id = $1`, [String(id)]);
  }

  // ----- Comments ---------------------------------------------------------
  async listComments(deckId: string): Promise<DeckComment[]> {
    const rows = await query<{
      id: string;
      deck_id: string;
      author: string;
      body: string;
      date: string;
      parent_id: string | null;
    }>(`select * from comments where deck_id = $1 order by date asc`, [deckId]);
    return rows.map((r) => ({
      id: r.id,
      deckId: r.deck_id,
      author: r.author,
      body: r.body,
      date: new Date(r.date).getTime(),
      parentId: r.parent_id,
    }));
  }

  async addComment(c: DeckComment): Promise<void> {
    await query(
      `insert into comments (deck_id, parent_id, author, body, date)
       values ($1,$2,$3,$4,$5)`,
      [c.deckId, c.parentId ?? null, c.author, c.body, new Date(c.date).toISOString()],
    );
  }

  async deleteComment(_deckId: string, id: number | string): Promise<void> {
    await query(`delete from comments where id = $1`, [String(id)]);
  }

  // ----- Collection -------------------------------------------------------
  private mapCollection(r: {
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
  }): CollectionCard {
    return {
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
    };
  }

  async listCollection(): Promise<CollectionCard[]> {
    const rows = await query(`select * from collection order by updated_at desc`);
    return rows.map((r) => this.mapCollection(r as never));
  }

  async getCollectionEntry(id: string): Promise<CollectionCard | null> {
    const rows = await query(`select * from collection where id = $1`, [id]);
    return rows[0] ? this.mapCollection(rows[0] as never) : null;
  }

  async getCollectionByOracle(oracleId: string): Promise<CollectionCard[]> {
    const rows = await query(`select * from collection where oracle_id = $1`, [oracleId]);
    return rows.map((r) => this.mapCollection(r as never));
  }

  async ownedOracleIds(): Promise<Set<string>> {
    const rows = await query<{ oracle_id: string }>(`select distinct oracle_id from collection`);
    return new Set(rows.map((r) => r.oracle_id));
  }

  private collectionValues(e: CollectionCard): unknown[] {
    return [
      e.id,
      e.printingId,
      e.oracleId,
      e.name,
      e.setCode ?? null,
      e.setName ?? null,
      e.collectorNumber ?? null,
      e.finish,
      e.quantity,
      JSON.stringify(e.card),
    ];
  }

  async saveCollectionEntry(entry: CollectionCard): Promise<void> {
    if (entry.quantity <= 0) return this.removeCollectionEntry(entry.id);
    await query(
      `insert into collection (id, printing_id, oracle_id, name, set_code, set_name, collector_number, finish, quantity, card_json, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       on conflict (id) do update set
         quantity = excluded.quantity, card_json = excluded.card_json,
         set_code = excluded.set_code, set_name = excluded.set_name,
         collector_number = excluded.collector_number, updated_at = now()`,
      this.collectionValues(entry),
    );
  }

  async saveCollectionEntries(entries: CollectionCard[]): Promise<void> {
    const valid = entries.filter((e) => e.quantity > 0);
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const cols = 10;
      const placeholders = slice
        .map((_, k) => `(${Array.from({ length: cols }, (_, j) => `$${k * cols + j + 1}`).join(",")}, now())`)
        .join(",");
      const params = slice.flatMap((e) => this.collectionValues(e));
      await query(
        `insert into collection (id, printing_id, oracle_id, name, set_code, set_name, collector_number, finish, quantity, card_json, updated_at)
         values ${placeholders}
         on conflict (id) do update set
           quantity = excluded.quantity, card_json = excluded.card_json,
           set_code = excluded.set_code, set_name = excluded.set_name,
           collector_number = excluded.collector_number, updated_at = now()`,
        params,
      );
    }
  }

  async removeCollectionEntry(id: string): Promise<void> {
    await query(`delete from collection where id = $1`, [id]);
  }

  async clearCollection(): Promise<void> {
    await query(`delete from collection`);
  }

  // ----- Wishlist ---------------------------------------------------------
  async listWishlist(): Promise<WishlistCard[]> {
    const rows = await query<{
      oracle_id: string;
      name: string;
      card_json: WishlistCard["card"];
      quantity: number;
      note: string | null;
      added_at: string;
      updated_at: string;
    }>(`select * from wishlist order by updated_at desc`);
    return rows.map((r) => ({
      oracleId: r.oracle_id,
      name: r.name,
      card: r.card_json,
      quantity: r.quantity,
      note: r.note ?? undefined,
      addedAt: new Date(r.added_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  }

  async getWishlistEntry(oracleId: string): Promise<WishlistCard | null> {
    const rows = await query<{
      oracle_id: string;
      name: string;
      card_json: WishlistCard["card"];
      quantity: number;
      note: string | null;
      added_at: string;
      updated_at: string;
    }>(`select * from wishlist where oracle_id = $1`, [oracleId]);
    const r = rows[0];
    if (!r) return null;
    return {
      oracleId: r.oracle_id,
      name: r.name,
      card: r.card_json,
      quantity: r.quantity,
      note: r.note ?? undefined,
      addedAt: new Date(r.added_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    };
  }

  async saveWishlistEntry(entry: WishlistCard): Promise<void> {
    if (entry.quantity <= 0) return this.removeWishlistEntry(entry.oracleId);
    await query(
      `insert into wishlist (oracle_id, name, card_json, quantity, note, updated_at)
       values ($1,$2,$3,$4,$5, now())
       on conflict (oracle_id) do update set
         name = excluded.name, card_json = excluded.card_json,
         quantity = excluded.quantity, note = excluded.note, updated_at = now()`,
      [entry.oracleId, entry.name, JSON.stringify(entry.card), entry.quantity, entry.note ?? null],
    );
  }

  async removeWishlistEntry(oracleId: string): Promise<void> {
    await query(`delete from wishlist where oracle_id = $1`, [oracleId]);
  }
}

export const pgRepo = new PgRepo();

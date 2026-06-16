import type { Deck } from "@/types";

/**
 * Persistence layer for the showcase features. Two implementations:
 * - LocalRepo (IndexedDB) — zero-setup default; sharing/comments disabled.
 * - SupabaseRepo (PostgREST) — used when NEXT_PUBLIC_SUPABASE_URL/ANON_KEY
 *   are set; schema in supabase/schema.sql.
 */

export interface ShowcaseDeckMeta {
  id: string;
  name: string;
  format: string;
  commanderNames: string[];
  commanderArt?: string;
  colorIdentity: string[];
  updatedAt: number;
}

export interface ShowcaseDeck extends ShowcaseDeckMeta {
  deck: Deck;
  description?: string;
}

/** Owner-editable markdown sections of the primer. */
export interface Primer {
  deckId: string;
  strategy: string;
  combos: string;
  mulligans: string;
  matchups: string;
  budget: string;
  updatedAt: number;
}

export const PRIMER_SECTIONS: { key: keyof Omit<Primer, "deckId" | "updatedAt">; label: string }[] = [
  { key: "strategy", label: "Strategy" },
  { key: "combos", label: "Key combos" },
  { key: "mulligans", label: "Mulligan guide" },
  { key: "matchups", label: "Matchups" },
  { key: "budget", label: "Budget swaps" },
];

export interface VersionChange {
  name: string;
  reason?: string;
}

/** One dated update session in the deck's changelog. */
export interface DeckVersion {
  id?: number | string;
  deckId: string;
  date: number;
  title: string;
  adds: VersionChange[];
  cuts: VersionChange[];
  notes?: string;
}

export type GameResult = "W" | "L" | "D";

export interface GameRecord {
  id?: number | string;
  deckId: string;
  date: number;
  podSize: number;
  /** Opposing commanders / deck names faced. */
  opponents: string[];
  result: GameResult;
  turns?: number;
  mulligans?: number;
  notablePlays?: string;
  isPlaytest: boolean;
}

export interface DeckComment {
  id?: number | string;
  deckId: string;
  author: string;
  body: string;
  date: number;
  parentId?: number | string | null;
}

// ---------------------------------------------------------------------------
// Collection tracking (Phase 5)
// ---------------------------------------------------------------------------

export type CardFinish = "nonfoil" | "foil" | "etched";

export const FINISH_LABEL: Record<CardFinish, string> = {
  nonfoil: "Nonfoil",
  foil: "Foil",
  etched: "Etched",
};

/** One owned stack: a specific printing in a specific finish. */
export interface CollectionCard {
  /** `${printingId}:${finish}` — unique per printing+finish. */
  id: string;
  printingId: string;
  oracleId: string;
  name: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  finish: CardFinish;
  quantity: number;
  /** Cached printing for display (image, price). */
  card: import("@/types").ScryCard;
  addedAt: number;
  updatedAt: number;
}

export function collectionEntryId(printingId: string, finish: CardFinish): string {
  return `${printingId}:${finish}`;
}

/** Unit price for a finish, from the cached printing's Scryfall (TCGplayer) data. */
export function finishPrice(card: import("@/types").ScryCard, finish: CardFinish): number | null {
  const raw = finish === "nonfoil" ? card.prices?.usd : card.prices?.usd_foil;
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : null;
}

export interface Repo {
  readonly mode: "local" | "supabase";

  listDecks(): Promise<ShowcaseDeckMeta[]>;
  getDeck(id: string): Promise<ShowcaseDeck | null>;
  saveDeck(deck: Deck, description?: string): Promise<string>;
  deleteDeck(id: string): Promise<void>;

  getPrimer(deckId: string): Promise<Primer | null>;
  savePrimer(primer: Primer): Promise<void>;

  listVersions(deckId: string): Promise<DeckVersion[]>;
  addVersion(version: DeckVersion): Promise<void>;
  deleteVersion(deckId: string, id: number | string): Promise<void>;

  listGames(deckId: string): Promise<GameRecord[]>;
  addGame(game: GameRecord): Promise<void>;
  deleteGame(deckId: string, id: number | string): Promise<void>;

  listComments(deckId: string): Promise<DeckComment[]>;
  addComment(comment: DeckComment): Promise<void>;
  deleteComment(deckId: string, id: number | string): Promise<void>;

  // Collection
  listCollection(): Promise<CollectionCard[]>;
  /** Single owned stack by id (indexed — for +/- edits, no full-table read). */
  getCollectionEntry(id: string): Promise<CollectionCard | null>;
  /** All owned printings/finishes of one oracle id (indexed). */
  getCollectionByOracle(oracleId: string): Promise<CollectionCard[]>;
  /** Distinct owned oracle ids (for the "owned only" filter; no blob load). */
  ownedOracleIds(): Promise<Set<string>>;
  /** Upsert an owned stack; quantity <= 0 removes it. */
  saveCollectionEntry(entry: CollectionCard): Promise<void>;
  /** Bulk upsert (CSV import). Entries with quantity <= 0 are skipped. */
  saveCollectionEntries(entries: CollectionCard[]): Promise<void>;
  removeCollectionEntry(id: string): Promise<void>;
  /** Wipe the whole collection (for "replace on import"). */
  clearCollection(): Promise<void>;
}

/** Aggregates computed from a deck's game log. */
export interface GameStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  winRateByPod: { podSize: number; games: number; winRate: number }[];
  avgTurns: number | null;
  mulliganRate: number | null;
  mostFaced: { name: string; count: number }[];
}

export function computeGameStats(games: GameRecord[]): GameStats {
  const total = games.length;
  const wins = games.filter((g) => g.result === "W").length;
  const losses = games.filter((g) => g.result === "L").length;
  const draws = games.filter((g) => g.result === "D").length;

  const pods = new Map<number, { games: number; wins: number }>();
  for (const g of games) {
    const p = pods.get(g.podSize) ?? { games: 0, wins: 0 };
    p.games++;
    if (g.result === "W") p.wins++;
    pods.set(g.podSize, p);
  }

  const turns = games.filter((g) => g.turns !== undefined && g.turns > 0);
  const mulls = games.filter((g) => g.mulligans !== undefined);

  const faced = new Map<string, number>();
  for (const g of games) {
    for (const o of g.opponents) {
      const name = o.trim();
      if (name) faced.set(name, (faced.get(name) ?? 0) + 1);
    }
  }

  return {
    total,
    wins,
    losses,
    draws,
    winRate: total > 0 ? wins / total : null,
    winRateByPod: [...pods.entries()]
      .map(([podSize, p]) => ({ podSize, games: p.games, winRate: p.wins / p.games }))
      .sort((a, b) => a.podSize - b.podSize),
    avgTurns: turns.length > 0 ? turns.reduce((n, g) => n + (g.turns ?? 0), 0) / turns.length : null,
    mulliganRate:
      mulls.length > 0 ? mulls.reduce((n, g) => n + (g.mulligans ?? 0), 0) / mulls.length : null,
    mostFaced: [...faced.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

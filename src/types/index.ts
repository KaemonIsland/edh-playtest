/**
 * Shared core types for the EDH playtester.
 * Everything here must stay serializable (structured-clone safe) so game
 * state can be snapshotted to IndexedDB and diffed for undo/redo.
 */

// ---------------------------------------------------------------------------
// Scryfall card data
// ---------------------------------------------------------------------------

export type ManaColor = "W" | "U" | "B" | "R" | "G" | "C";

export interface ScryImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface ScryCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ScryImageUris;
}

export type Legality = "legal" | "not_legal" | "restricted" | "banned";

/** The subset of Scryfall card fields the app uses. */
export interface ScryCard {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  produced_mana?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  layout: string;
  card_faces?: ScryCardFace[];
  image_uris?: ScryImageUris;
  legalities: Partial<Record<string, Legality>>;
  /** USD prices are TCGplayer market prices (Scryfall's source). */
  prices?: { usd?: string | null; usd_foil?: string | null; eur?: string | null };
  set?: string;
  set_name?: string;
  collector_number?: string;
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export interface DeckEntry {
  card: ScryCard;
  quantity: number;
  isCommander: boolean;
  categories: string[];
}

/** Per-category builder settings. Categories like Sideboard/Maybeboard set
 * `inDeck: false` and are excluded from counts, stats, price, and playtesting. */
export interface CategorySetting {
  inDeck: boolean;
  inPrice: boolean;
}

/** Manual corrections to the auto-detected role buckets in the stats panel. */
export interface RoleOverrides {
  ramp?: { add: string[]; remove: string[] };
  draw?: { add: string[]; remove: string[] };
  interaction?: { add: string[]; remove: string[] };
  tutors?: { add: string[]; remove: string[] };
}

export interface Deck {
  id: string;
  name: string;
  format: string;
  commanders: ScryCard[];
  entries: DeckEntry[];
  colorIdentity: string[];
  /** User-made tags for sorting/filtering the deck library. */
  tags?: string[];
  /** Settings per category name (only non-default entries stored). */
  categorySettings?: Record<string, CategorySetting>;
  /** Commander bracket (1–5). Unset = show the auto-guess. */
  bracket?: number;
  roleOverrides?: RoleOverrides;
}

/** Entries that count as part of the deck (not sideboard/maybeboard). */
export function includedEntries(deck: Deck): DeckEntry[] {
  const settings = deck.categorySettings ?? {};
  return deck.entries.filter((e) => {
    const cat = e.categories[0];
    if (!cat) return true;
    return settings[cat]?.inDeck !== false;
  });
}

/** One parsed line of a raw decklist, before Scryfall resolution. */
export interface ParsedDeckLine {
  raw: string;
  name: string;
  quantity: number;
  isCommander: boolean;
  categories: string[];
  setCode?: string;
  collectorNumber?: string;
}

export interface ParsedDecklist {
  lines: ParsedDeckLine[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Zone =
  | "library"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "command"
  | "stack";

export const ALL_ZONES: Zone[] = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
  "stack",
];

export interface TokenSpec {
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  colors: string[];
  oracleText?: string;
  /** If the token was pulled from Scryfall, the image to render. */
  imageUri?: string;
}

/** A unique physical card on the table (one per copy). */
export interface CardInstance {
  instanceId: string;
  /** Scryfall print id; key into the card cache. Empty for custom tokens. */
  cardId: string;
  oracleId: string;
  ownerId: string;
  /**
   * Set when another player controls the card (theft). Battlefield placement
   * follows the controller; every other zone returns to the owner (a stolen
   * creature still dies to its owner's graveyard).
   */
  controllerId?: string;
  zone: Zone;
  tapped: boolean;
  faceDown: boolean;
  /** Current face index for DFC/MDFC cards. */
  flipped: number;
  counters: Record<string, number>;
  attachedTo?: string;
  attachments: string[];
  /** Free battlefield position, in px relative to the battlefield surface. */
  position?: { x: number; y: number };
  enteredOnTurn?: number;
  isToken: boolean;
  tokenSpec?: TokenSpec;
}

export interface PlayerState {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  experience: number;
  /** Times each commander has been cast from the command zone, keyed by oracle_id. */
  commanderTax: Record<string, number>;
  manaPool: Record<ManaColor, number>;
  /** Generic named counters (storm, monarch, etc.). */
  counters: Record<string, number>;
  mulligans: number;
  commanderOracleIds: string[];
}

export type Phase =
  | "untap"
  | "upkeep"
  | "draw"
  | "main1"
  | "combat"
  | "main2"
  | "end";

export const PHASES: Phase[] = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "combat",
  "main2",
  "end",
];

// ---------------------------------------------------------------------------
// Action log — typed events (Chunk 3 builds game tracking on these)
// ---------------------------------------------------------------------------

export type LogEvent =
  | { type: "game"; message: string }
  | { type: "move"; cardName: string; from: Zone; to: Zone; message: string }
  | { type: "draw"; count: number; message: string }
  | { type: "mulligan"; count: number; message: string }
  | { type: "tap"; cardName: string; tapped: boolean; message: string }
  | { type: "counter"; target: string; counter: string; delta: number; message: string }
  | { type: "life"; playerId: string; delta: number; total: number; message: string }
  | { type: "tracker"; playerId: string; tracker: string; value: number; message: string }
  | { type: "mana"; playerId: string; color: ManaColor | "clear"; message: string }
  | { type: "roll"; die: string; result: number | string; message: string }
  | { type: "token"; cardName: string; message: string }
  | { type: "turn"; turn: number; message: string }
  | { type: "phase"; phase: Phase; message: string }
  | { type: "library"; action: string; message: string }
  /** Bot decisions + the reasoning behind them (transparency requirement). */
  | { type: "bot"; message: string; reasoning?: string };

export interface LogEntry {
  id: string;
  ts: number;
  turn: number;
  playerId: string;
  event: LogEvent;
}

// ---------------------------------------------------------------------------
// GameState
// ---------------------------------------------------------------------------

/**
 * Everything that describes a moment of the game. `GameState` adds the
 * undo/redo stacks on top of this; history entries are `GameCore` snapshots.
 */
export interface GameCore {
  players: Record<string, PlayerState>;
  playerOrder: string[];
  turn: number;
  phase: Phase;
  activePlayerId: string;
  instances: Record<string, CardInstance>;
  /** Ordered card lists per player per zone (library order matters). */
  zoneOrder: Record<string, Record<Zone, string[]>>;
  log: LogEntry[];
}

export interface GameState extends GameCore {
  history: GameCore[];
  future: GameCore[];
}

// ---------------------------------------------------------------------------
// Snapshots (saved games in IndexedDB)
// ---------------------------------------------------------------------------

export interface GameSnapshot {
  id?: number;
  name: string;
  savedAt: number;
  deckName: string;
  core: GameCore;
  /** Cards referenced by the snapshot so it can be restored offline. */
  cards: ScryCard[];
}

// ---------------------------------------------------------------------------
// Helpers shared across features
// ---------------------------------------------------------------------------

export function isCreature(typeLine: string): boolean {
  return /\bCreature\b/.test(typeLine);
}

export function isLand(typeLine: string): boolean {
  return /\bLand\b/.test(typeLine);
}

/** The active face of a card given an instance's flipped index. */
export function activeFace(card: ScryCard, flipped: number): ScryCardFace {
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces[Math.min(flipped, card.card_faces.length - 1)] ?? card.card_faces[0]!;
  }
  return {
    name: card.name,
    mana_cost: card.mana_cost,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    image_uris: card.image_uris,
  };
}

/** Image for the current face, preferring `normal` size. */
export function faceImage(card: ScryCard, flipped: number): string | undefined {
  const face = activeFace(card, flipped);
  const uris = face.image_uris ?? card.image_uris;
  return uris?.normal ?? uris?.large ?? uris?.small ?? uris?.png;
}

import type { Deck, DeckEntry, RoleOverrides, ScryCard } from "@/types";
import { byColor } from "@/lib/cards/sort";
import {
  frontTypeLine,
  hasLandFace,
  includedEntries,
  isBoardCategory,
  isFrontLand,
  isLand,
} from "@/types";

/**
 * Deck analysis heuristics. Card-role classification is text-based and
 * intentionally rough — it's a guide the user can correct via roleOverrides.
 * Sideboard/maybeboard categories (inDeck: false) are excluded throughout.
 */

export type PipColor = "W" | "U" | "B" | "R" | "G";
export const PIP_COLORS: PipColor[] = ["W", "U", "B", "R", "G"];

export interface ColorBalance {
  color: PipColor;
  pips: number;
  pipShare: number;
  sources: number;
  landSources: number;
  sourceShare: number;
  shortfall: boolean;
}

export type Role = "ramp" | "draw" | "interaction" | "tutors";

export interface DeckStats {
  cardCount: number;
  landCount: number;
  recommendedLands: [number, number];
  avgCmc: number;
  curve: { cmc: string; count: number }[];
  colorBalance: ColorBalance[];
  shortfalls: PipColor[];
  roles: Record<Role, string[]>;
  /** Which role names came from the auto-detector (vs. manual overrides). */
  autoRoles: Record<Role, string[]>;
  expectedCommanderTurn: number | null;
  priceUsd: number | null;
  priceMissing: number;
  bracketGuess: number;
}

function oracle(card: ScryCard): string {
  return (
    card.oracle_text ??
    card.card_faces?.map((f) => f.oracle_text ?? "").join("\n") ??
    ""
  );
}

/**
 * Colors a card can produce. Scryfall's `produced_mana` when present;
 * otherwise derived from basic land types and "Add {G}…" oracle text —
 * MTGJSON-synced cards don't carry produced_mana, which left the
 * pips-vs-sources bars empty.
 */
function producedManaOf(card: ScryCard): string[] {
  if (card.produced_mana && card.produced_mana.length > 0) return card.produced_mana;
  const out = new Set<string>();
  const typeLines = [card.type_line, ...(card.card_faces?.map((f) => f.type_line ?? "") ?? [])]
    .join(" ");
  const BASICS: [string, string][] = [
    ["Plains", "W"],
    ["Island", "U"],
    ["Swamp", "B"],
    ["Mountain", "R"],
    ["Forest", "G"],
  ];
  for (const [sub, c] of BASICS) if (typeLines.includes(sub)) out.add(c);
  // Scan "Add …" clauses for mana symbols / "any color".
  for (const m of oracle(card).matchAll(/\badds?\b[^.\n]*/gi)) {
    for (const sym of m[0].matchAll(/\{([WUBRGC])\}/g)) out.add(sym[1]!);
    if (/any (?:one )?color/i.test(m[0])) for (const c of ["W", "U", "B", "R", "G"]) out.add(c);
  }
  return [...out];
}

const RAMP_RE =
  /(\{t\}[^.]*add |adds? (?:\{[wubrgc\d]\})+|add (?:one|two|three) mana|search your library for (?:a|up to two|two)[^.]{0,40}land)/i;
const DRAW_RE = /draw (a card|two|three|four|x|that many|cards equal)/i;
const INTERACTION_RE =
  /(destroy target|exile target|counter target|destroy all|exile all|deals? \d+ damage to (any target|target creature|target planeswalker)|return target [^.]{0,30}to its owner's hand|fight target|gets? -\d+\/-\d+)/i;
const TUTOR_RE = /search your library for a(?!n? ?(?:basic )?land)/i;

function autoRolesOf(card: ScryCard): Record<Role, boolean> {
  const text = oracle(card);
  if (isFrontLand(card))
    return { ramp: false, draw: false, interaction: false, tutors: false };
  return {
    ramp: RAMP_RE.test(text) && card.cmc <= 4,
    draw: DRAW_RE.test(text),
    interaction: INTERACTION_RE.test(text),
    tutors: TUTOR_RE.test(text),
  };
}

function applyOverrides(
  auto: string[],
  override: { add: string[]; remove: string[] } | undefined,
): string[] {
  if (!override) return auto;
  const removed = new Set(override.remove);
  const merged = auto.filter((n) => !removed.has(n));
  for (const n of override.add) if (!merged.includes(n)) merged.push(n);
  return merged;
}

function countPips(cost: string | undefined): Record<PipColor, number> {
  const pips: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (!cost) return pips;
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    for (const part of m[1]!.split("/")) {
      const c = part.toUpperCase();
      if (c in pips) pips[c as PipColor] += 1;
    }
  }
  return pips;
}

/**
 * Rough Commander bracket guess (1–5). Real brackets depend on the
 * game-changers list and table intent; this is just a starting point the
 * user can override on the showcase.
 */
function guessBracket(args: {
  tutors: number;
  avgCmc: number;
  interaction: number;
  ramp: number;
  priceUsd: number | null;
}): number {
  let score = 2;
  if (args.tutors >= 3) score += 1;
  if (args.tutors >= 6) score += 1;
  if (args.avgCmc <= 2.7 && args.interaction >= 10) score += 1;
  if (args.avgCmc >= 3.6 && args.tutors <= 1) score -= 1;
  if (args.priceUsd !== null && args.priceUsd < 120 && args.tutors <= 1) score -= 1;
  return Math.max(1, Math.min(5, score));
}

export function computeDeckStats(deck: Deck): DeckStats {
  const entries = includedEntries(deck).filter((e) => !e.isCommander);
  // Curve/roles classify by front face (a "Sorcery // Land" MDFC is a spell you
  // cast), but the land count includes any card with a land face — the back of
  // an MDFC is always playable as a land.
  const nonland = entries.filter((e) => !isFrontLand(e.card));
  const identity = new Set(
    (deck.colorIdentity.length > 0
      ? deck.colorIdentity
      : deck.commanders.flatMap((c) => c.color_identity)) as PipColor[],
  );

  const cardCount = entries.reduce((n, e) => n + e.quantity, 0) + deck.commanders.length;
  const landCount = entries
    .filter((e) => hasLandFace(e.card))
    .reduce((n, e) => n + e.quantity, 0);

  // Mana curve (nonland), bucketed 0..6, 7+
  const curveBuckets = new Map<string, number>();
  for (let i = 0; i <= 6; i++) curveBuckets.set(String(i), 0);
  curveBuckets.set("7+", 0);
  let cmcSum = 0;
  let cmcCards = 0;
  for (const e of nonland) {
    const bucket = e.card.cmc >= 7 ? "7+" : String(Math.floor(e.card.cmc));
    curveBuckets.set(bucket, (curveBuckets.get(bucket) ?? 0) + e.quantity);
    cmcSum += e.card.cmc * e.quantity;
    cmcCards += e.quantity;
  }

  // Color pips in costs (incl. commanders) vs producers — restricted to the
  // commander's color identity: off-identity production (any-color rocks,
  // treasure makers) is noise for this check.
  const inIdentity = (c: PipColor) => identity.size === 0 || identity.has(c);
  const pipTotals: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const considerCost = (card: ScryCard, qty: number) => {
    const p = countPips(card.mana_cost ?? card.card_faces?.[0]?.mana_cost);
    for (const c of PIP_COLORS) if (inIdentity(c)) pipTotals[c] += p[c] * qty;
  };
  for (const e of nonland) considerCost(e.card, e.quantity);
  for (const c of deck.commanders) considerCost(c, 1);

  const sourceTotals: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const landSourceTotals: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const e of entries) {
    const produced = producedManaOf(e.card);
    for (const c of PIP_COLORS) {
      if (inIdentity(c) && produced.includes(c)) {
        sourceTotals[c] += e.quantity;
        if (hasLandFace(e.card)) landSourceTotals[c] += e.quantity;
      }
    }
  }

  const totalPips = PIP_COLORS.reduce((n, c) => n + pipTotals[c], 0);
  const totalSources = PIP_COLORS.reduce((n, c) => n + sourceTotals[c], 0);
  const colorBalance: ColorBalance[] = PIP_COLORS.filter(
    (c) => inIdentity(c) && (pipTotals[c] > 0 || sourceTotals[c] > 0),
  ).map((color) => {
    const pipShare = totalPips > 0 ? pipTotals[color] / totalPips : 0;
    const sourceShare = totalSources > 0 ? sourceTotals[color] / totalSources : 0;
    return {
      color,
      pips: pipTotals[color],
      pipShare,
      sources: sourceTotals[color],
      landSources: landSourceTotals[color],
      sourceShare,
      shortfall: pipTotals[color] > 0 && pipShare > sourceShare + 0.08 && sourceTotals[color] < 14,
    };
  });

  // Role buckets: auto-detect, then apply the user's manual overrides.
  const auto: Record<Role, string[]> = { ramp: [], draw: [], interaction: [], tutors: [] };
  for (const e of nonland) {
    const r = autoRolesOf(e.card);
    for (const role of ["ramp", "draw", "interaction", "tutors"] as const) {
      if (r[role]) auto[role].push(e.card.name);
    }
  }
  const ov: RoleOverrides = deck.roleOverrides ?? {};
  const roles: Record<Role, string[]> = {
    ramp: applyOverrides(auto.ramp, ov.ramp),
    draw: applyOverrides(auto.draw, ov.draw),
    interaction: applyOverrides(auto.interaction, ov.interaction),
    tutors: applyOverrides(auto.tutors, ov.tutors),
  };

  const cmdrCmc = deck.commanders[0]?.cmc ?? null;
  const expectedCommanderTurn =
    cmdrCmc !== null
      ? Math.max(
          Math.ceil(cmdrCmc / 2),
          Math.round(cmdrCmc) - Math.min(2, Math.floor(roles.ramp.length / 6)),
        )
      : null;

  // Price honours per-category inPrice settings.
  const settings = deck.categorySettings ?? {};
  const pricedEntries = deck.entries.filter((e) => {
    const cat = e.categories[0];
    if (!cat) return true;
    const s = settings[cat];
    if (!s) return true;
    return s.inPrice !== false && s.inDeck !== false;
  });
  let priceUsd = 0;
  let priceMissing = 0;
  let anyPrice = false;
  const priced = [...pricedEntries, ...deck.commanders.map((c) => ({ card: c, quantity: 1 }))];
  for (const e of priced) {
    const p = parseFloat(e.card.prices?.usd ?? "");
    if (Number.isFinite(p)) {
      priceUsd += p * e.quantity;
      anyPrice = true;
    } else {
      priceMissing += e.quantity;
    }
  }

  const finalPrice = anyPrice ? priceUsd : null;

  return {
    cardCount,
    landCount,
    recommendedLands: [35, 38],
    avgCmc: cmcCards > 0 ? cmcSum / cmcCards : 0,
    curve: [...curveBuckets.entries()].map(([cmc, count]) => ({ cmc, count })),
    colorBalance,
    shortfalls: colorBalance.filter((b) => b.shortfall).map((b) => b.color),
    roles,
    autoRoles: auto,
    expectedCommanderTurn,
    priceUsd: finalPrice,
    priceMissing,
    bracketGuess: guessBracket({
      tutors: roles.tutors.length,
      avgCmc: cmcCards > 0 ? cmcSum / cmcCards : 0,
      interaction: roles.interaction.length,
      ramp: roles.ramp.length,
      priceUsd: finalPrice,
    }),
  };
}

// ---------------------------------------------------------------------------
// Opening-hand odds (hypergeometric)
// ---------------------------------------------------------------------------

function lnFact(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function lnChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return lnFact(n) - lnFact(k) - lnFact(n - k);
}

/** P(at least `want` successes drawing `draws` from `deckSize` with `hits` successes). */
export function probAtLeast(deckSize: number, hits: number, draws: number, want: number): number {
  if (hits <= 0 || deckSize <= 0) return 0;
  let pLess = 0;
  for (let k = 0; k < want; k++) {
    const ln = lnChoose(hits, k) + lnChoose(deckSize - hits, draws - k) - lnChoose(deckSize, draws);
    if (Number.isFinite(ln)) pLess += Math.exp(ln);
  }
  return Math.max(0, Math.min(1, 1 - pLess));
}

export interface OddsRow {
  label: string;
  qty: number;
  /** P(>=1 in opening 7) */
  p1: number;
  /** P(>=2 in opening 7) */
  p2: number;
}

/** Opening-hand odds per category and per card type. */
export function computeOdds(deck: Deck): { categories: OddsRow[]; types: OddsRow[] } {
  const entries = includedEntries(deck).filter((e) => !e.isCommander);
  const deckSize = entries.reduce((n, e) => n + e.quantity, 0);

  // Every category on a card counts — "≥1 Draw" includes cards whose premier
  // column is elsewhere. Uncategorized cards fall back to their type group.
  const byCat = new Map<string, number>();
  for (const e of entries) {
    const cats = e.categories.filter((c) => !isBoardCategory(c));
    for (const cat of cats.length > 0 ? cats : [typeGroup(e.card)]) {
      byCat.set(cat, (byCat.get(cat) ?? 0) + e.quantity);
    }
  }

  const byType = new Map<string, number>();
  for (const e of entries) {
    byType.set(typeGroup(e.card), (byType.get(typeGroup(e.card)) ?? 0) + e.quantity);
  }

  const toRows = (m: Map<string, number>): OddsRow[] =>
    [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, qty]) => ({
        label,
        qty,
        p1: probAtLeast(deckSize, qty, 7, 1),
        p2: probAtLeast(deckSize, qty, 7, 2),
      }));

  return { categories: toRows(byCat), types: toRows(byType) };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export function typeGroup(card: ScryCard): string {
  // Multi-face cards group by their front face (adventure = creature, MDFC
  // spell//land = spell) — matches how they're played from hand.
  const tl = frontTypeLine(card);
  if (isLand(tl)) return "Lands";
  if (/\bCreature\b/.test(tl)) return "Creatures";
  if (/\bPlaneswalker\b/.test(tl)) return "Planeswalkers";
  if (/\bInstant\b/.test(tl)) return "Instants";
  if (/\bSorcery\b/.test(tl)) return "Sorceries";
  if (/\bArtifact\b/.test(tl)) return "Artifacts";
  if (/\bEnchantment\b/.test(tl)) return "Enchantments";
  if (/\bBattle\b/.test(tl)) return "Battles";
  return "Other";
}

const GROUP_ORDER = [
  "Creatures",
  "Planeswalkers",
  "Instants",
  "Sorceries",
  "Artifacts",
  "Enchantments",
  "Battles",
  "Other",
  "Lands",
];

/** Group entries by premier category, falling back to card type. Excluded
 * (sideboard/maybeboard) categories sort last. */
export function groupEntries(deck: Deck): { group: string; entries: DeckEntry[]; inDeck: boolean }[] {
  const settings = deck.categorySettings ?? {};
  const groups = new Map<string, DeckEntry[]>();
  for (const e of deck.entries) {
    if (e.isCommander) continue;
    const group = e.categories[0] ?? typeGroup(e.card);
    const list = groups.get(group) ?? [];
    list.push(e);
    groups.set(group, list);
  }
  return [...groups.entries()]
    .map(([group, entries]) => ({
      group,
      entries: entries.sort(
        (a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name),
      ),
      inDeck: settings[group]?.inDeck !== false,
    }))
    .sort((a, b) => {
      if (a.inDeck !== b.inDeck) return a.inDeck ? -1 : 1;
      const ia = GROUP_ORDER.indexOf(a.group);
      const ib = GROUP_ORDER.indexOf(b.group);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return 1;
      if (ib >= 0) return -1;
      return a.group.localeCompare(b.group);
    });
}

// ---------------------------------------------------------------------------
// Builder lenses — different ways to lay the same deck out
// ---------------------------------------------------------------------------

/**
 * "category" = one column per premier category (a card appears once).
 * "category-all" = a card appears in every category it holds: solid in its
 * premier column, ghosted everywhere else.
 * "type" / "curve" / "color" regroup without touching category data.
 */
export type GroupLens = "category" | "category-all" | "type" | "curve" | "color" | "rarity";

/** In-stack ordering (independent of the grouping lens). */
export type StackSort = "cmc" | "name" | "color" | "rarity" | "type";

export interface LensEntry {
  entry: DeckEntry;
  /** Shown semi-transparent: the card's premier home is another column. */
  ghost: boolean;
  /** Ghosts carry their premier group name (shown as "· Draw"). */
  home?: string;
}

export interface LensGroup {
  group: string;
  entries: LensEntry[];
}

const COLOR_GROUP_ORDER = [
  "White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands",
];

function colorGroup(card: ScryCard): string {
  if (isFrontLand(card)) return "Lands";
  const ci = card.color_identity;
  if (ci.length === 0) return "Colorless";
  if (ci.length > 1) return "Multicolor";
  return { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" }[ci[0]!] ?? "Colorless";
}

function curveGroup(card: ScryCard): string {
  if (isFrontLand(card)) return "Lands";
  return card.cmc >= 7 ? "7+ drops" : `${Math.floor(card.cmc)} drops`;
}

const RARITY_RANK: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

function rarityRank(card: ScryCard): number {
  return RARITY_RANK[(card.rarity ?? "").toLowerCase()] ?? 4;
}

const RARITY_GROUP_ORDER = ["Mythic", "Rare", "Uncommon", "Common", "Other"];

function rarityGroup(card: ScryCard): string {
  const r = (card.rarity ?? "").toLowerCase();
  if (r === "mythic") return "Mythic";
  if (r === "rare") return "Rare";
  if (r === "uncommon") return "Uncommon";
  if (r === "common") return "Common";
  return "Other";
}

function stackComparator(sort: StackSort): (a: LensEntry, b: LensEntry) => number {
  const name = (a: LensEntry, b: LensEntry) => a.entry.card.name.localeCompare(b.entry.card.name);
  switch (sort) {
    case "name":
      return name;
    case "color":
      return (a, b) => byColor(a.entry.card, b.entry.card);
    case "rarity":
      // Rarity rank, then color inside each rarity — "which binder/box is it in".
      return (a, b) =>
        rarityRank(a.entry.card) - rarityRank(b.entry.card) ||
        byColor(a.entry.card, b.entry.card);
    case "type":
      return (a, b) => {
        const ia = GROUP_ORDER.indexOf(typeGroup(a.entry.card));
        const ib = GROUP_ORDER.indexOf(typeGroup(b.entry.card));
        if (ia !== ib) return ia - ib;
        return a.entry.card.cmc - b.entry.card.cmc || name(a, b);
      };
    default: // cmc
      return (a, b) => a.entry.card.cmc - b.entry.card.cmc || name(a, b);
  }
}

/**
 * Group the deck's *included* entries (commanders and excluded boards are the
 * caller's job) through the chosen lens.
 */
export function groupEntriesByLens(
  deck: Deck,
  lens: GroupLens,
  sort: StackSort = "cmc",
): LensGroup[] {
  const settings = deck.categorySettings ?? {};
  const included = deck.entries.filter((e) => {
    if (e.isCommander) return false;
    const cat = e.categories[0];
    return !cat || settings[cat]?.inDeck !== false;
  });

  const groups = new Map<string, LensEntry[]>();
  const push = (group: string, le: LensEntry) => {
    const list = groups.get(group) ?? [];
    list.push(le);
    groups.set(group, list);
  };

  for (const e of included) {
    const primary = e.categories[0] ?? typeGroup(e.card);
    if (lens === "type") {
      push(typeGroup(e.card), { entry: e, ghost: false });
    } else if (lens === "curve") {
      push(curveGroup(e.card), { entry: e, ghost: false });
    } else if (lens === "color") {
      push(colorGroup(e.card), { entry: e, ghost: false });
    } else if (lens === "rarity") {
      push(rarityGroup(e.card), { entry: e, ghost: false });
    } else {
      push(primary, { entry: e, ghost: false });
      if (lens === "category-all") {
        for (const cat of e.categories.slice(1)) {
          // Board categories never receive ghosts — they live in the dock.
          if (cat !== primary && !isBoardCategory(cat)) {
            push(cat, { entry: e, ghost: true, home: primary });
          }
        }
      }
    }
  }

  const order =
    lens === "color"
      ? COLOR_GROUP_ORDER
      : lens === "rarity"
        ? RARITY_GROUP_ORDER
        : lens === "curve"
          ? ["0 drops", "1 drops", "2 drops", "3 drops", "4 drops", "5 drops", "6 drops", "7+ drops", "Lands"]
          : GROUP_ORDER;

  const cmp = stackComparator(sort);
  return [...groups.entries()]
    .map(([group, entries]) => ({ group, entries: entries.sort(cmp) }))
    .sort((a, b) => {
      const ia = order.indexOf(a.group);
      const ib = order.indexOf(b.group);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return 1;
      if (ib >= 0) return -1;
      return a.group.localeCompare(b.group);
    });
}

// ---------------------------------------------------------------------------
// Skeleton — category targets vs. actual counts
// ---------------------------------------------------------------------------

/** Starting-point template; every deck can override per category. */
export const DEFAULT_SKELETON: Record<string, number> = {
  Lands: 35,
  Ramp: 10,
  Draw: 10,
  Interaction: 10,
  "Board Wipes": 3,
  Protection: 3,
  "Win Cons": 3,
};

export interface SkeletonRow {
  name: string;
  count: number;
  target: number;
  /** Count came from the auto role detector, not explicit categories. */
  auto: boolean;
}

/** Explicit category → auto-detected role fallback when uncategorized. */
const ROLE_FOR_CATEGORY: Record<string, Role> = {
  ramp: "ramp",
  draw: "draw",
  "card draw": "draw",
  interaction: "interaction",
  removal: "interaction",
  tutors: "tutors",
};

/**
 * Every category on a card counts (not just its premier column), so Hydroid
 * Krasis with [Draw, X Spells, Win Cons] adds one to all three rows. "Lands"
 * counts by card type. When a targeted category has no cards categorized yet,
 * the matching auto-detected role (if any) fills in, flagged `auto`.
 */
export function computeSkeleton(deck: Deck, stats: DeckStats): SkeletonRow[] {
  const targets = deck.skeleton ?? DEFAULT_SKELETON;
  const counts = new Map<string, number>();
  for (const e of includedEntries(deck)) {
    if (e.isCommander) continue;
    for (const cat of e.categories) {
      if (isBoardCategory(cat)) continue;
      const key = cat.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + e.quantity);
    }
  }

  return Object.entries(targets).map(([name, target]) => {
    if (name.toLowerCase() === "lands") {
      return { name, count: stats.landCount, target, auto: false };
    }
    const explicit = counts.get(name.toLowerCase()) ?? 0;
    if (explicit === 0) {
      const role = ROLE_FOR_CATEGORY[name.toLowerCase()];
      if (role && stats.roles[role].length > 0) {
        return { name, count: stats.roles[role].length, target, auto: true };
      }
    }
    return { name, count: explicit, target, auto: false };
  });
}

/** Cards per type group (included, non-commander) — the dock's type tally. */
export function typeTally(deck: Deck): { type: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of includedEntries(deck)) {
    if (e.isCommander) continue;
    const t = typeGroup(e.card);
    m.set(t, (m.get(t) ?? 0) + e.quantity);
  }
  return GROUP_ORDER.filter((t) => m.has(t)).map((t) => ({ type: t, count: m.get(t)! }));
}

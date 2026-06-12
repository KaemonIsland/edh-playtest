import type { Deck, DeckEntry, RoleOverrides, ScryCard } from "@/types";
import { includedEntries, isLand } from "@/types";

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

const RAMP_RE =
  /(\{t\}[^.]*add |adds? (?:\{[wubrgc\d]\})+|add (?:one|two|three) mana|search your library for (?:a|up to two|two)[^.]{0,40}land)/i;
const DRAW_RE = /draw (a card|two|three|four|x|that many|cards equal)/i;
const INTERACTION_RE =
  /(destroy target|exile target|counter target|destroy all|exile all|deals? \d+ damage to (any target|target creature|target planeswalker)|return target [^.]{0,30}to its owner's hand|fight target|gets? -\d+\/-\d+)/i;
const TUTOR_RE = /search your library for a(?!n? ?(?:basic )?land)/i;

function autoRolesOf(card: ScryCard): Record<Role, boolean> {
  const text = oracle(card);
  if (isLand(card.type_line))
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
  const nonland = entries.filter((e) => !isLand(e.card.type_line));
  const lands = entries.filter((e) => isLand(e.card.type_line));
  const identity = new Set(
    (deck.colorIdentity.length > 0
      ? deck.colorIdentity
      : deck.commanders.flatMap((c) => c.color_identity)) as PipColor[],
  );

  const cardCount = entries.reduce((n, e) => n + e.quantity, 0) + deck.commanders.length;
  const landCount = lands.reduce((n, e) => n + e.quantity, 0);

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
    const produced = e.card.produced_mana ?? [];
    for (const c of PIP_COLORS) {
      if (inIdentity(c) && produced.includes(c)) {
        sourceTotals[c] += e.quantity;
        if (isLand(e.card.type_line)) landSourceTotals[c] += e.quantity;
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

  const byCat = new Map<string, number>();
  for (const e of entries) {
    const cat = e.categories[0] ?? typeGroup(e.card);
    byCat.set(cat, (byCat.get(cat) ?? 0) + e.quantity);
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
  const tl = card.type_line;
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

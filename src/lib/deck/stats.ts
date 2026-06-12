import type { Deck, DeckEntry, ScryCard } from "@/types";
import { isLand } from "@/types";

/**
 * Deck analysis heuristics. Card-role classification is text-based and
 * intentionally rough — it's a guide, not a judge.
 */

export type PipColor = "W" | "U" | "B" | "R" | "G";
export const PIP_COLORS: PipColor[] = ["W", "U", "B", "R", "G"];

export interface ColorBalance {
  color: PipColor;
  /** Colored mana symbols across nonland spell costs. */
  pips: number;
  pipShare: number;
  /** Cards that can produce this color (lands and nonland producers). */
  sources: number;
  landSources: number;
  sourceShare: number;
  /** True when pip demand clearly outpaces the mana base. */
  shortfall: boolean;
}

export interface DeckStats {
  cardCount: number;
  landCount: number;
  recommendedLands: [number, number];
  avgCmc: number;
  curve: { cmc: string; count: number }[];
  colorBalance: ColorBalance[];
  shortfalls: PipColor[];
  ramp: string[];
  draw: string[];
  interaction: string[];
  tutors: string[];
  expectedCommanderTurn: number | null;
  priceUsd: number | null;
  priceMissing: number;
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

function classify(entry: DeckEntry): { ramp: boolean; draw: boolean; interaction: boolean; tutor: boolean } {
  const card = entry.card;
  const text = oracle(card);
  if (isLand(card.type_line)) return { ramp: false, draw: false, interaction: false, tutor: false };
  return {
    ramp: RAMP_RE.test(text) && card.cmc <= 4,
    draw: DRAW_RE.test(text),
    interaction: INTERACTION_RE.test(text),
    tutor: TUTOR_RE.test(text),
  };
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

export function computeDeckStats(deck: Deck): DeckStats {
  const entries = deck.entries.filter((e) => !e.isCommander);
  const nonland = entries.filter((e) => !isLand(e.card.type_line));
  const lands = entries.filter((e) => isLand(e.card.type_line));

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

  // Color pips in costs (incl. commanders) vs producers in the deck.
  const pipTotals: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const considerCost = (card: ScryCard, qty: number) => {
    const p = countPips(card.mana_cost ?? card.card_faces?.[0]?.mana_cost);
    for (const c of PIP_COLORS) pipTotals[c] += p[c] * qty;
  };
  for (const e of nonland) considerCost(e.card, e.quantity);
  for (const c of deck.commanders) considerCost(c, 1);

  const sourceTotals: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const landSourceTotals: Record<PipColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const e of entries) {
    const produced = e.card.produced_mana ?? [];
    for (const c of PIP_COLORS) {
      if (produced.includes(c)) {
        sourceTotals[c] += e.quantity;
        if (isLand(e.card.type_line)) landSourceTotals[c] += e.quantity;
      }
    }
  }

  const totalPips = PIP_COLORS.reduce((n, c) => n + pipTotals[c], 0);
  const totalSources = PIP_COLORS.reduce((n, c) => n + sourceTotals[c], 0);
  const colorBalance: ColorBalance[] = PIP_COLORS.filter(
    (c) => pipTotals[c] > 0 || sourceTotals[c] > 0,
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
      // Demands meaningfully more of a color than the base provides.
      shortfall: pipTotals[color] > 0 && pipShare > sourceShare + 0.08 && sourceTotals[color] < 14,
    };
  });

  // Role buckets
  const ramp: string[] = [];
  const draw: string[] = [];
  const interaction: string[] = [];
  const tutors: string[] = [];
  for (const e of nonland) {
    const roles = classify(e);
    if (roles.ramp) ramp.push(e.card.name);
    if (roles.draw) draw.push(e.card.name);
    if (roles.interaction) interaction.push(e.card.name);
    if (roles.tutor) tutors.push(e.card.name);
  }

  // Rough expected commander turn: its CMC, accelerated ~1 turn per 6 ramp
  // pieces, never earlier than ceil(cmc/2).
  const cmdrCmc = deck.commanders[0]?.cmc ?? null;
  const expectedCommanderTurn =
    cmdrCmc !== null
      ? Math.max(Math.ceil(cmdrCmc / 2), Math.round(cmdrCmc) - Math.min(2, Math.floor(ramp.length / 6)))
      : null;

  // Price (Scryfall USD where present)
  let priceUsd = 0;
  let priceMissing = 0;
  let anyPrice = false;
  const priced = [...entries, ...deck.commanders.map((c) => ({ card: c, quantity: 1 }))];
  for (const e of priced) {
    const p = parseFloat(e.card.prices?.usd ?? "");
    if (Number.isFinite(p)) {
      priceUsd += p * e.quantity;
      anyPrice = true;
    } else {
      priceMissing += e.quantity;
    }
  }

  return {
    cardCount,
    landCount,
    recommendedLands: [35, 38],
    avgCmc: cmcCards > 0 ? cmcSum / cmcCards : 0,
    curve: [...curveBuckets.entries()].map(([cmc, count]) => ({ cmc, count })),
    colorBalance,
    shortfalls: colorBalance.filter((b) => b.shortfall).map((b) => b.color),
    ramp,
    draw,
    interaction,
    tutors,
    expectedCommanderTurn,
    priceUsd: anyPrice ? priceUsd : null,
    priceMissing,
  };
}

/** Group entries by their import categories, falling back to card type. */
export function groupEntries(deck: Deck): { group: string; entries: DeckEntry[] }[] {
  const groups = new Map<string, DeckEntry[]>();
  const typeGroup = (card: ScryCard): string => {
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
  };
  for (const e of deck.entries) {
    if (e.isCommander) continue;
    const group = e.categories[0] ?? typeGroup(e.card);
    const list = groups.get(group) ?? [];
    list.push(e);
    groups.set(group, list);
  }
  const ORDER = [
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
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ia = ORDER.indexOf(a);
      const ib = ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return 1;
      if (ib >= 0) return -1;
      return a.localeCompare(b);
    })
    .map(([group, entries]) => ({
      group,
      entries: entries.sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name)),
    }));
}

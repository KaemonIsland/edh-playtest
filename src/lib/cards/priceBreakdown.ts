"use client";

import type { ScryCard } from "@/types";
import { isLand } from "@/types";
import type { CollectionCard } from "@/lib/repo";
import { priceOf } from "@/lib/cards/pricing";

/**
 * Collection price analytics — value distribution, "realistic" valuations, and
 * breakdowns by color and card type. All figures use the active price source
 * (priceOf), counting each owned copy by quantity. Cards with no known price
 * are tracked separately rather than counted as $0.
 */

/** One owned copy-stack with its resolved unit price (null = unpriced). */
export interface ValuedCopy {
  card: ScryCard;
  quantity: number;
  unit: number | null;
}

/** Resolve a unit price for every owned stack (active price source). */
export function valueCopies(cards: CollectionCard[]): ValuedCopy[] {
  return cards
    .filter((c) => c.quantity > 0)
    .map((c) => ({ card: c.card, quantity: c.quantity, unit: priceOf(c.card, c.finish) }));
}

// --- Price buckets -----------------------------------------------------------

export interface PriceBucket {
  label: string;
  min: number;
  max: number; // exclusive (Infinity for the top bucket)
}

/** Value tiers, MTG-appropriate (bulk → chase). Min inclusive, max exclusive. */
export const PRICE_BUCKETS: PriceBucket[] = [
  { label: "< $0.50", min: 0, max: 0.5 },
  { label: "$0.50 – $1", min: 0.5, max: 1 },
  { label: "$1 – $5", min: 1, max: 5 },
  { label: "$5 – $10", min: 5, max: 10 },
  { label: "$10 – $25", min: 10, max: 25 },
  { label: "$25 – $50", min: 25, max: 50 },
  { label: "$50 – $100", min: 50, max: 100 },
  { label: "$100+", min: 100, max: Infinity },
];

export interface BucketRow extends PriceBucket {
  /** Total physical copies in this bucket. */
  count: number;
  /** Distinct stacks in this bucket. */
  stacks: number;
  /** Summed value (unit × quantity). */
  value: number;
}

// --- Category breakdowns -----------------------------------------------------

export type ColorKey = "W" | "U" | "B" | "R" | "G" | "multicolor" | "colorless" | "land";

export const COLOR_LABEL: Record<ColorKey, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  multicolor: "Multicolor",
  colorless: "Colorless",
  land: "Land",
};

const WUBRG = "WUBRG";

function colorKey(card: ScryCard): ColorKey {
  if (isLand(card.type_line)) return "land";
  const colors = (card.colors ?? []).filter((c) => WUBRG.includes(c));
  if (colors.length === 0) return "colorless";
  if (colors.length === 1) return colors[0] as ColorKey;
  return "multicolor";
}

export const TYPE_ORDER = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Land",
  "Other",
] as const;
export type TypeKey = (typeof TYPE_ORDER)[number];

/** Primary card type for grouping (one per card, by precedence above). */
function typeKey(card: ScryCard): TypeKey {
  const tl = card.type_line.toLowerCase();
  if (isLand(card.type_line)) return "Land";
  for (const t of TYPE_ORDER) {
    if (t !== "Land" && t !== "Other" && tl.includes(t.toLowerCase())) return t;
  }
  return "Other";
}

export interface CategoryRow<K extends string> {
  key: K;
  label: string;
  count: number;
  stacks: number;
  value: number;
}

// --- Aggregate ---------------------------------------------------------------

export interface PriceBreakdown {
  /** Copies considered after the cheap-card threshold (priced only). */
  totalCards: number;
  totalValue: number;
  /** Copies with a known price (after threshold). */
  pricedCards: number;
  /** Copies with no price data — excluded from value math. */
  unpricedCards: number;
  /** Copies dropped because their unit price was below the threshold. */
  excludedCards: number;
  excludedValue: number;
  meanUnit: number;
  /** Quantity-weighted median unit price — the "typical card" you own. */
  medianUnit: number;
  buckets: BucketRow[];
  byColor: CategoryRow<ColorKey>[];
  byType: CategoryRow<TypeKey>[];
}

/** Quantity-weighted median of unit prices. */
function weightedMedianUnit(copies: ValuedCopy[]): number {
  const priced = copies
    .filter((c) => c.unit !== null)
    .map((c) => ({ unit: c.unit!, qty: c.quantity }))
    .sort((a, b) => a.unit - b.unit);
  const totalQty = priced.reduce((n, c) => n + c.qty, 0);
  if (totalQty === 0) return 0;
  const mid = totalQty / 2;
  let cum = 0;
  for (const c of priced) {
    cum += c.qty;
    if (cum >= mid) return c.unit;
  }
  return priced[priced.length - 1]?.unit ?? 0;
}

/**
 * Build the full breakdown. `excludeUnder` drops copies whose unit price is
 * below that threshold (default 0 = keep everything) — so "ignore cards under
 * $1" is `excludeUnder: 1`. Unpriced copies are always excluded from value math.
 */
export function priceBreakdown(copies: ValuedCopy[], excludeUnder = 0): PriceBreakdown {
  let excludedCards = 0;
  let excludedValue = 0;
  let unpricedCards = 0;
  const kept: ValuedCopy[] = [];
  for (const c of copies) {
    if (c.unit === null) {
      unpricedCards += c.quantity;
      continue;
    }
    if (c.unit < excludeUnder) {
      excludedCards += c.quantity;
      excludedValue += c.unit * c.quantity;
      continue;
    }
    kept.push(c);
  }

  const buckets: BucketRow[] = PRICE_BUCKETS.map((b) => ({ ...b, count: 0, stacks: 0, value: 0 }));
  const colorMap = new Map<ColorKey, CategoryRow<ColorKey>>();
  const typeMap = new Map<TypeKey, CategoryRow<TypeKey>>();
  let totalCards = 0;
  let totalValue = 0;

  for (const c of kept) {
    const unit = c.unit!;
    const v = unit * c.quantity;
    totalCards += c.quantity;
    totalValue += v;

    const b = buckets.find((x) => unit >= x.min && unit < x.max);
    if (b) {
      b.count += c.quantity;
      b.stacks += 1;
      b.value += v;
    }

    const ck = colorKey(c.card);
    const cr = colorMap.get(ck) ?? { key: ck, label: COLOR_LABEL[ck], count: 0, stacks: 0, value: 0 };
    cr.count += c.quantity;
    cr.stacks += 1;
    cr.value += v;
    colorMap.set(ck, cr);

    const tk = typeKey(c.card);
    const tr = typeMap.get(tk) ?? { key: tk, label: tk, count: 0, stacks: 0, value: 0 };
    tr.count += c.quantity;
    tr.stacks += 1;
    tr.value += v;
    typeMap.set(tk, tr);
  }

  const colorOrder: ColorKey[] = ["W", "U", "B", "R", "G", "multicolor", "colorless", "land"];
  const byColor = colorOrder.map((k) => colorMap.get(k)).filter((r): r is CategoryRow<ColorKey> => !!r);
  const byType = TYPE_ORDER.map((k) => typeMap.get(k)).filter((r): r is CategoryRow<TypeKey> => !!r);

  return {
    totalCards,
    totalValue,
    pricedCards: totalCards,
    unpricedCards,
    excludedCards,
    excludedValue,
    meanUnit: totalCards ? totalValue / totalCards : 0,
    medianUnit: weightedMedianUnit(kept),
    buckets,
    byColor,
    byType,
  };
}

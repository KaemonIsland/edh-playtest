import type { ScryCard } from "@/types";
import { isLand } from "@/types";

/**
 * Default deckbuilding color sort, matching the common convention used by
 * Archidekt/Moxfield: mono White → Blue → Black → Red → Green, then
 * multicolored, then colorless, then lands. Within a group: by mana value,
 * then name. Multicolor cards are grouped by color count, then by their
 * WUBRG-ordered combination so guilds/shards cluster together.
 */

const WUBRG = "WUBRG";

/** Primary color-group rank (0..7). */
function colorGroup(card: ScryCard): number {
  if (isLand(card.type_line)) return 7;
  const colors = (card.colors ?? []).filter((c) => WUBRG.includes(c));
  if (colors.length === 0) return 6; // colorless
  if (colors.length === 1) return WUBRG.indexOf(colors[0]!); // 0..4
  return 5; // multicolored
}

/** WUBRG bitmask for stable multicolor ordering. */
function colorMask(card: ScryCard): number {
  let mask = 0;
  for (const c of card.colors ?? []) {
    const i = WUBRG.indexOf(c);
    if (i >= 0) mask |= 1 << i;
  }
  return mask;
}

export function byColor(a: ScryCard, b: ScryCard): number {
  const ga = colorGroup(a);
  const gb = colorGroup(b);
  if (ga !== gb) return ga - gb;
  if (ga === 5) {
    // multicolor: fewer colors first, then WUBRG combination
    const ca = (a.colors ?? []).length;
    const cb = (b.colors ?? []).length;
    if (ca !== cb) return ca - cb;
    const ma = colorMask(a);
    const mb = colorMask(b);
    if (ma !== mb) return ma - mb;
  }
  if (a.cmc !== b.cmc) return a.cmc - b.cmc;
  return a.name.localeCompare(b.name);
}

export type CardSort = "color" | "newest" | "name" | "cmc" | "value";

export function cardComparator(
  sort: CardSort,
  priceOf?: (c: ScryCard) => number,
): (a: ScryCard, b: ScryCard) => number {
  switch (sort) {
    case "newest":
      return (a, b) =>
        (b.released_at ?? "").localeCompare(a.released_at ?? "") || a.name.localeCompare(b.name);
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "cmc":
      return (a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name);
    case "value":
      return (a, b) => (priceOf?.(b) ?? 0) - (priceOf?.(a) ?? 0) || a.name.localeCompare(b.name);
    default:
      return byColor;
  }
}

"use client";

import type { ScryCard } from "@/types";
import type { NumOp } from "@/lib/cards/carddb";
import { priceOf } from "@/lib/cards/pricing";

/**
 * THE card filter model. Every surface that filters cards (collection, all
 * cards, deck search, suggestions) uses this shape, `matchesFilters` for
 * client-side predicates, and the shared controls in
 * components/cards/FilterControls.tsx for the UI. Don't invent new filter
 * shapes — extend this one.
 */

export const FILTER_COLORS = ["W", "U", "B", "R", "G", "C"] as const;
export const FILTER_RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
export const FILTER_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Battle",
  "Land",
] as const;

export interface CardFilters {
  name: string;
  types: string[];
  colors: string[];
  colorMode: "any" | "exact" | "identity";
  mvOp: NumOp;
  mv: string;
  powerOp: NumOp;
  power: string;
  toughnessOp: NumOp;
  toughness: string;
  rarities: string[];
  text: string;
  /** Only cards that can be a commander (legendary creature / "can be your commander"). */
  commanderOnly: boolean;
  /** USD price bounds (nonfoil), as strings; "" = unbounded. */
  priceMin: string;
  priceMax: string;
}

export function emptyFilters(): CardFilters {
  return {
    name: "",
    types: [],
    colors: [],
    colorMode: "any",
    mvOp: ">=",
    mv: "",
    powerOp: ">=",
    power: "",
    toughnessOp: ">=",
    toughness: "",
    rarities: [],
    text: "",
    commanderOnly: false,
    priceMin: "",
    priceMax: "",
  };
}

/** Heuristic for "can be a commander": legendary creature or rules text. */
export function canBeCommander(card: ScryCard): boolean {
  const tl = card.type_line.toLowerCase();
  if (tl.includes("legendary") && tl.includes("creature")) return true;
  const text =
    card.oracle_text ?? card.card_faces?.map((f) => f.oracle_text ?? "").join("\n") ?? "";
  return /can be your commander/i.test(text);
}

export function filtersActive(f: CardFilters): boolean {
  return Boolean(
    f.name ||
      f.text ||
      f.types.length ||
      f.colors.length ||
      f.mv ||
      f.power ||
      f.toughness ||
      f.rarities.length ||
      f.commanderOnly ||
      f.priceMin ||
      f.priceMax,
  );
}

function cmp(value: number, op: NumOp, target: number): boolean {
  if (op === "=") return value === target;
  if (op === ">=") return value >= target;
  return value <= target;
}

/** Client-side predicate matching a card against the filter set. */
export function matchesFilters(card: ScryCard, f: CardFilters): boolean {
  if (f.name && !card.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.text) {
    const o = card.oracle_text ?? card.card_faces?.map((x) => x.oracle_text ?? "").join("\n") ?? "";
    if (!o.toLowerCase().includes(f.text.toLowerCase())) return false;
  }
  if (f.types.length) {
    const tl = card.type_line.toLowerCase();
    if (!f.types.every((t) => tl.includes(t.toLowerCase()))) return false;
  }
  if (f.colors.length) {
    const cc = card.colors ?? [];
    if (f.colorMode === "identity") {
      if (!card.color_identity.every((x) => f.colors.includes(x))) return false;
    } else if (f.colorMode === "exact") {
      const want = f.colors.filter((c) => c !== "C");
      if (f.colors.includes("C")) {
        if (cc.length !== 0) return false;
      } else if (cc.length !== want.length || !want.every((x) => cc.includes(x))) return false;
    } else {
      // any
      if (f.colors.includes("C") && cc.length === 0) {
        /* colorless matches */
      } else if (!cc.some((x) => f.colors.includes(x))) return false;
    }
  }
  const num = (raw: string | undefined): number | null => {
    const n = parseFloat(raw ?? "");
    return Number.isFinite(n) ? n : null;
  };
  if (f.mv.trim()) {
    const t = parseFloat(f.mv);
    if (Number.isFinite(t) && !cmp(card.cmc, f.mvOp, t)) return false;
  }
  if (f.power.trim()) {
    const t = parseFloat(f.power);
    const p = num(card.power);
    if (Number.isFinite(t) && (p === null || !cmp(p, f.powerOp, t))) return false;
  }
  if (f.toughness.trim()) {
    const t = parseFloat(f.toughness);
    const tg = num(card.toughness);
    if (Number.isFinite(t) && (tg === null || !cmp(tg, f.toughnessOp, t))) return false;
  }
  if (f.rarities.length && !f.rarities.includes((card.rarity ?? "").toLowerCase())) return false;
  if (f.commanderOnly && !canBeCommander(card)) return false;
  if (f.priceMin.trim() || f.priceMax.trim()) {
    // Filter on the card's nonfoil price from the synced index (MTGJSON-sourced
    // cards carry no embedded Scryfall price); unknown prices fail any bound.
    const price = priceOf(card, "nonfoil");
    const min = parseFloat(f.priceMin);
    const max = parseFloat(f.priceMax);
    if (Number.isFinite(min) && (price === null || price < min)) return false;
    if (Number.isFinite(max) && (price === null || price > max)) return false;
  }
  return true;
}

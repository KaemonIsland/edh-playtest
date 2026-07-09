"use client";

import type { Deck, ScryCard } from "@/types";
import { includedEntries } from "@/types";
import { fetchCardsByIds } from "@/lib/cards/carddb";

/** MIME type carrying a token's card JSON through native drag-and-drop. */
export const TOKEN_DND_TYPE = "application/x-mtg-token";

/** Collect the distinct token Scryfall ids a set of cards creates. */
function tokenIdsFrom(cards: ScryCard[]): { ids: Set<string>; sawParts: boolean } {
  const ids = new Set<string>();
  let sawParts = false;
  for (const c of cards) {
    if (c.all_parts) {
      sawParts = true;
      for (const p of c.all_parts) {
        if (p.component === "token") ids.add(p.id);
      }
    }
  }
  return { ids, sawParts };
}

/**
 * Resolve every token a deck can make, from its cards' Scryfall `all_parts`.
 * Falls back to re-fetching the deck's cards when they were stored before
 * `all_parts` was tracked, so older decks still get their tokens.
 */
export async function resolveDeckTokens(deck: Deck): Promise<ScryCard[]> {
  // Only count cards that are actually in the deck — skip maybeboard/sideboard
  // and any category flagged "not in deck".
  const deckCards = [...deck.commanders, ...includedEntries(deck).map((e) => e.card)];

  // Cards stored without `all_parts` (e.g. built from the MTGJSON card search)
  // can't tell us their tokens, so re-fetch just those from Scryfall and merge —
  // this is why some decks showed no tokens even when they make them.
  const ids = tokenIdsFrom(deckCards.filter((c) => c.all_parts)).ids;
  const missing = deckCards.filter((c) => !c.all_parts).map((c) => c.id).filter(Boolean);
  if (missing.length > 0) {
    const fresh = await fetchCardsByIds(missing);
    for (const id of tokenIdsFrom(fresh).ids) ids.add(id);
  }

  if (ids.size === 0) return [];
  const tokens = await fetchCardsByIds([...ids]);

  // Consolidate functionally-identical tokens (e.g. five "Copy" tokens, or the
  // same 2/2 Zombie from different cards) — but keep genuinely different ones
  // apart (a 2/2 Zombie vs a 2/2 Zombie with decayed vs a */* W/B Zombie).
  const seen = new Set<string>();
  const unique: ScryCard[] = [];
  for (const t of tokens) {
    const key = JSON.stringify([
      t.name,
      t.type_line,
      t.oracle_text ?? "",
      t.power ?? "",
      t.toughness ?? "",
      [...(t.colors ?? [])].sort(),
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  return unique.sort((a, b) => a.name.localeCompare(b.name));
}
